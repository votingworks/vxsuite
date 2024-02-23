import { useEffect, useState, useCallback } from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';
import { safeParseJson } from '@votingworks/types';

import { Scan } from '@votingworks/api';
import {
  Hardware,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import {
  Main,
  UnlockMachineScreen,
  InvalidCardScreen,
  RemoveCardScreen,
  Screen,
  SetupCardReaderPage,
  useDevices,
  H1,
} from '@votingworks/ui';
import { LogEventId, Logger } from '@votingworks/logging';
import { assert } from '@votingworks/basics';
import { AppContext, AppContextInterface } from './contexts/app_context';

import { useInterval } from './hooks/use_interval';

import { ScanBallotsScreen } from './screens/scan_ballots_screen';
import { BallotEjectScreen } from './screens/ballot_eject_screen';
import { SettingsScreen } from './screens/settings_screen';

import { MachineLockedScreen } from './screens/machine_locked_screen';
import {
  checkPin,
  getAuthStatus,
  getElectionDefinition,
  getMachineConfig,
  getTestMode,
  getUsbDriveStatus,
} from './api';
import { UnconfiguredElectionScreenWrapper } from './screens/unconfigured_election_screen_wrapper';
import { SystemAdministratorScreen } from './screens/system_administrator_screen';

export interface AppRootProps {
  hardware: Hardware;
  logger: Logger;
}

export function AppRoot({
  hardware,
  logger,
}: AppRootProps): JSX.Element | null {
  const [status, setStatus] = useState<Scan.GetScanStatusResponse>({
    canUnconfigure: true,
    batches: [],
    adjudication: { remaining: 0, adjudicated: 0 },
  });

  const { batchScanner } = useDevices({
    hardware,
    logger,
  });

  const machineConfigQuery = getMachineConfig.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const authStatusQuery = getAuthStatus.useQuery();
  const userRole =
    authStatusQuery.data?.status === 'logged_in'
      ? authStatusQuery.data.user.role
      : 'unknown';
  const checkPinMutation = checkPin.useMutation();

  const getTestModeQuery = getTestMode.useQuery();
  const isTestMode = getTestModeQuery.data ?? false;

  const electionDefinitionQuery = getElectionDefinition.useQuery();

  const [isExportingCvrs, setIsExportingCvrs] = useState(false);

  const { adjudication } = status;

  const [isScanning, setIsScanning] = useState(false);
  const [currentScanningBatchId, setCurrentScanningBatchId] =
    useState<string>();
  const [lastScannedSheetIdx, setLastScannedSheetIdx] = useState(0);

  useEffect(() => {
    if (!currentScanningBatchId) {
      return;
    }
    const currentBatch = status.batches.find(
      (b) => b.id === currentScanningBatchId
    );
    if (!currentBatch) {
      return;
    }
    if (currentBatch.count > lastScannedSheetIdx) {
      if (status.adjudication.remaining > 0) {
        // Scanning a sheet failed and needs adjudication.
        void logger.log(LogEventId.ScanSheetComplete, userRole, {
          disposition: 'failure',
          message: 'Sheet rejected while scanning.',
          result:
            'Sheet not tabulated, user asked to intervene in order to proceed.',
          batchId: currentScanningBatchId,
          sheetCount: currentBatch.count,
        });
        return;
      }
      setLastScannedSheetIdx(currentBatch.count);
      void logger.log(LogEventId.ScanSheetComplete, userRole, {
        disposition: 'success',
        message: `Sheet number ${currentBatch.count} in batch ${currentScanningBatchId} scanned successfully`,
        batchId: currentScanningBatchId,
        sheetCount: currentBatch.count,
      });
    }

    if (currentBatch.endedAt !== undefined) {
      void logger.log(LogEventId.ScanBatchComplete, userRole, {
        disposition: 'success',
        message: `Scanning batch ${currentScanningBatchId} successfully completed scanning ${currentBatch.count} sheets.`,
        batchId: currentScanningBatchId,
        sheetCount: currentBatch.count,
        scanningEndedAt: currentBatch.endedAt,
      });
      setLastScannedSheetIdx(0);
      setCurrentScanningBatchId(undefined);
    }
  }, [
    status.batches,
    status.adjudication,
    currentScanningBatchId,
    logger,
    userRole,
    lastScannedSheetIdx,
  ]);

  const updateStatus = useCallback(async () => {
    try {
      const body = await (await fetch('/central-scanner/scan/status')).text();
      const newStatus = safeParseJson(
        body,
        Scan.GetScanStatusResponseSchema
      ).unsafeUnwrap();
      setStatus((prevStatus) => {
        if (JSON.stringify(prevStatus) === JSON.stringify(newStatus)) {
          return prevStatus;
        }
        const currentScanningBatch = newStatus.batches.find(
          ({ endedAt }) => !endedAt
        );
        setIsScanning(
          newStatus.adjudication.remaining === 0 &&
            currentScanningBatch !== undefined
        );
        return newStatus;
      });
    } catch (error) {
      setIsScanning(false);
      console.log('failed updateStatus()', error); // eslint-disable-line no-console
    }
  }, [setStatus]);

  const scanBatch = useCallback(async () => {
    setIsScanning(true);
    try {
      const result = safeParseJson(
        await (
          await fetch('/central-scanner/scan/scanBatch', {
            method: 'post',
          })
        ).text(),
        Scan.ScanBatchResponseSchema
      ).unsafeUnwrap();
      if (result.status !== 'ok') {
        // eslint-disable-next-line no-alert
        window.alert(`could not scan: ${JSON.stringify(result.errors)}`);
        await logger.log(LogEventId.ScanBatchInit, userRole, {
          disposition: 'failure',
          message: 'Failed to start scanning a new batch.',
          error: JSON.stringify(result.errors),
          result: 'Scanning not begun.',
        });
        setIsScanning(false);
      } else {
        setCurrentScanningBatchId(result.batchId);
        await logger.log(LogEventId.ScanBatchInit, userRole, {
          disposition: 'success',
          message: `User has begun scanning a new batch with ID: ${result.batchId}`,
          batchId: result.batchId,
        });
      }
    } catch (error) {
      assert(error instanceof Error);
      console.log('failed handleFileInput()', error); // eslint-disable-line no-console
      await logger.log(LogEventId.ScanBatchInit, userRole, {
        disposition: 'failure',
        message: 'Failed to start scanning a new batch.',
        error: error.message,
        result: 'Scanning not begun.',
      });
    }
  }, [logger, userRole]);

  const continueScanning = useCallback(
    async (request: Scan.ScanContinueRequest) => {
      setIsScanning(true);
      try {
        const result = safeParseJson(
          await (
            await fetch('/central-scanner/scan/scanContinue', {
              method: 'post',
              body: JSON.stringify(request),
              headers: {
                'Content-Type': 'application/json',
              },
            })
          ).text(),
          Scan.ScanContinueResponseSchema
        ).unsafeUnwrap();
        if (result.status === 'ok') {
          await logger.log(LogEventId.ScanBatchContinue, userRole, {
            disposition: 'success',
            message: request.forceAccept
              ? 'Sheet tabulated with warnings and scanning of batch continued.'
              : 'User indicated removing the sheet from tabulation and scanning continued without sheet.',
            sheetRemoved: !request.forceAccept,
          });
        } else {
          await logger.log(LogEventId.ScanBatchContinue, userRole, {
            disposition: 'failure',
            message: 'Request to continue scanning failed.',
            error: JSON.stringify(result.errors),
            result: 'Scanning not continued, user asked to try again.',
          });
        }
      } catch (error) {
        assert(error instanceof Error);
        console.log('failed handleFileInput()', error); // eslint-disable-line no-console
        await logger.log(LogEventId.ScanBatchContinue, userRole, {
          disposition: 'failure',
          message: 'Request to continue scanning failed.',
          error: error.message,
          result: 'Scanning not continued, user asked to try again.',
        });
      }
    },
    [logger, userRole]
  );

  // poll for scanning status on an interval if configured
  useInterval(
    useCallback(async () => {
      if (electionDefinitionQuery.data) {
        await updateStatus();
      }
    }, [electionDefinitionQuery.data, updateStatus]),
    1000
  );

  // initial scanning status check
  useEffect(() => {
    void updateStatus();
  }, [updateStatus]);

  if (
    !machineConfigQuery.isSuccess ||
    !authStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !electionDefinitionQuery.isSuccess ||
    !getTestModeQuery.isSuccess
  ) {
    return (
      <Screen>
        <Main padded centerChild>
          <H1>Loading Configuration...</H1>
        </Main>
      </Screen>
    );
  }
  const authStatus = authStatusQuery.data;
  const machineConfig = machineConfigQuery.data;
  const usbDriveStatus = usbDriveStatusQuery.data;
  const electionDefinition = electionDefinitionQuery.data ?? undefined;

  const currentContext: AppContextInterface = {
    usbDriveStatus,
    electionDefinition,
    isTestMode,
    machineConfig,
    logger,
    auth: authStatus,
  };

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
    return <SetupCardReaderPage usePollWorkerLanguage={false} />;
  }

  if (authStatus.status === 'logged_out') {
    if (authStatus.reason === 'machine_locked') {
      return (
        <AppContext.Provider value={currentContext}>
          <MachineLockedScreen />
        </AppContext.Provider>
      );
    }
    return (
      <InvalidCardScreen
        reasonAndContext={authStatus}
        recommendedAction={
          electionDefinition
            ? 'Use a valid Election Manager or System Administrator card.'
            : 'Use an Election Manager card.'
        }
      />
    );
  }

  if (authStatus.status === 'checking_pin') {
    return (
      <UnlockMachineScreen
        auth={authStatus}
        checkPin={async (pin) => {
          try {
            await checkPinMutation.mutateAsync({ pin });
          } catch {
            // Handled by default query client error handling
          }
        }}
      />
    );
  }

  if (authStatus.status === 'remove_card') {
    return <RemoveCardScreen productName="VxCentralScan" />;
  }

  if (isSystemAdministratorAuth(authStatus)) {
    return (
      <AppContext.Provider value={currentContext}>
        <SystemAdministratorScreen />
      </AppContext.Provider>
    );
  }

  if (!electionDefinition) {
    return (
      <AppContext.Provider value={currentContext}>
        <UnconfiguredElectionScreenWrapper
          isElectionManagerAuth={isElectionManagerAuth(authStatus)}
        />
      </AppContext.Provider>
    );
  }

  if (adjudication.remaining > 0 && !isScanning) {
    return (
      <AppContext.Provider value={currentContext}>
        <BallotEjectScreen
          continueScanning={continueScanning}
          isTestMode={isTestMode}
        />
      </AppContext.Provider>
    );
  }

  return (
    <AppContext.Provider value={currentContext}>
      <Switch>
        <Route path="/scan">
          <ScanBallotsScreen
            isScannerAttached={batchScanner !== undefined}
            isScanning={isScanning}
            isExportingCvrs={isExportingCvrs}
            setIsExportingCvrs={setIsExportingCvrs}
            scanBatch={scanBatch}
            status={status}
          />
        </Route>
        <Route path="/settings">
          <SettingsScreen
            isTestMode={isTestMode}
            canUnconfigure={status.canUnconfigure}
          />
        </Route>
        <Redirect to="/scan" />
      </Switch>
    </AppContext.Provider>
  );
}
