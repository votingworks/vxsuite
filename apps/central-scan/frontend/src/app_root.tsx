import React, { useEffect, useState, useCallback } from 'react';
import { Route, Switch } from 'react-router-dom';
import { safeParseJson } from '@votingworks/types';

import { Scan } from '@votingworks/api';
import {
  Hardware,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import {
  ElectionInfoBar,
  Main,
  UnlockMachineScreen,
  InvalidCardScreen,
  RemoveCardScreen,
  Screen,
  SetupCardReaderPage,
  SystemAdministratorScreenContents,
  UsbControllerButton,
  useDevices,
  LinkButton,
  Button,
  H1,
} from '@votingworks/ui';
import { LogEventId, Logger } from '@votingworks/logging';
import { assert } from '@votingworks/basics';
import { MachineConfig } from './config/types';
import { AppContext, AppContextInterface } from './contexts/app_context';

import { ScanButton } from './components/scan_button';
import { useInterval } from './hooks/use_interval';

import { DashboardScreen } from './screens/dashboard_screen';
import { BallotEjectScreen } from './screens/ballot_eject_screen';
import { AdminActionsScreen } from './screens/admin_actions_screen';

import { MainNav } from './components/main_nav';

import { ExportResultsModal } from './components/export_results_modal';
import { machineConfigProvider } from './util/machine_config';
import { MachineLockedScreen } from './screens/machine_locked_screen';
import {
  checkPin,
  ejectUsbDrive,
  getAuthStatus,
  getElectionDefinition,
  getTestMode,
  getUsbDriveStatus,
  legacyUsbDriveStatus,
  logOut,
  unconfigure,
} from './api';
import { UnconfiguredElectionScreenWrapper } from './screens/unconfigured_election_screen_wrapper';

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

  const [machineConfig, setMachineConfig] = useState<MachineConfig>({
    machineId: '0000',
    codeVersion: '',
  });

  const { cardReader, batchScanner } = useDevices({
    hardware,
    logger,
  });

  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const authStatusQuery = getAuthStatus.useQuery();
  const userRole =
    authStatusQuery.data?.status === 'logged_in'
      ? authStatusQuery.data.user.role
      : 'unknown';
  const checkPinMutation = checkPin.useMutation();
  const logOutMutation = logOut.useMutation();
  const ejectUsbDriveMutation = ejectUsbDrive.useMutation();

  const getTestModeQuery = getTestMode.useQuery();
  const isTestMode = getTestModeQuery.data ?? false;

  const electionDefinitionQuery = getElectionDefinition.useQuery();
  const unconfigureMutation = unconfigure.useMutation();
  const unconfigureMutate = unconfigureMutation.mutate;

  const [isExportingCvrs, setIsExportingCvrs] = useState(false);

  const { adjudication } = status;

  const [isScanning, setIsScanning] = useState(false);
  const [currentScanningBatchId, setCurrentScanningBatchId] =
    useState<string>();
  const [lastScannedSheetIdx, setLastScannedSheetIdx] = useState(0);

  useEffect(() => {
    async function initialize() {
      try {
        const newMachineConfig = await machineConfigProvider.get();
        setMachineConfig(newMachineConfig);
      } catch (e) {
        // TODO: what should happen in machineConfig not returned?
      }
    }

    void initialize();
  }, [setMachineConfig]);

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

  const systemAdministratorUnconfigure = useCallback(() => {
    unconfigureMutate({ ignoreBackupRequirement: true });
  }, [unconfigureMutate]);

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
  const electionDefinition = electionDefinitionQuery.data ?? undefined;

  const currentContext: AppContextInterface = {
    usbDriveStatus: usbDriveStatusQuery.data,
    electionDefinition,
    machineConfig,
    logger,
    auth: authStatus,
  };

  if (!cardReader) {
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
    if (authStatus.reason === 'machine_not_configured') {
      return (
        <InvalidCardScreen
          reason={authStatus.reason}
          recommendedAction="Please insert an Election Manager card."
        />
      );
    }
    return <InvalidCardScreen reason={authStatus.reason} />;
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
        <Screen>
          <SystemAdministratorScreenContents
            logger={logger}
            primaryText={
              <React.Fragment>
                To adjust settings for the current election, please insert an
                Election Manager card.
              </React.Fragment>
            }
            unconfigureMachine={() =>
              Promise.resolve(systemAdministratorUnconfigure())
            }
            isMachineConfigured={Boolean(electionDefinition)}
            usbDriveStatus={legacyUsbDriveStatus(usbDriveStatusQuery.data)}
          />
          {electionDefinition && (
            <ElectionInfoBar
              mode="admin"
              electionDefinition={electionDefinition}
              codeVersion={machineConfig.codeVersion}
              machineId={machineConfig.machineId}
            />
          )}
          <MainNav>
            <Button small onPress={() => logOutMutation.mutate()}>
              Lock Machine
            </Button>
          </MainNav>
        </Screen>
      </AppContext.Provider>
    );
  }

  if (!electionDefinition) {
    return (
      <UnconfiguredElectionScreenWrapper
        isElectionManagerAuth={isElectionManagerAuth(authStatus)}
      />
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

  let exportButtonTitle;
  if (adjudication.remaining > 0) {
    exportButtonTitle =
      'You cannot save results until all ballots have been adjudicated.';
  } else if (status.batches.length === 0) {
    exportButtonTitle =
      'You cannot save results until you have scanned at least 1 ballot.';
  }

  return (
    <AppContext.Provider value={currentContext}>
      <Switch>
        <Route path="/admin">
          <AdminActionsScreen
            isTestMode={isTestMode}
            canUnconfigure={status.canUnconfigure}
            electionDefinition={electionDefinition}
          />
        </Route>
        <Route path="/">
          <Screen>
            <Main padded>
              <DashboardScreen isScanning={isScanning} status={status} />
            </Main>
            <MainNav isTestMode={isTestMode}>
              <UsbControllerButton
                usbDriveStatus={legacyUsbDriveStatus(usbDriveStatusQuery.data)}
                usbDriveEject={() => ejectUsbDriveMutation.mutate()}
              />
              <Button small onPress={() => logOutMutation.mutate()}>
                Lock Machine
              </Button>
              <LinkButton small to="/admin">
                Admin
              </LinkButton>
              <Button
                small
                onPress={() => setIsExportingCvrs(true)}
                disabled={
                  adjudication.remaining > 0 || status.batches.length === 0
                }
                nonAccessibleTitle={exportButtonTitle}
              >
                Save CVRs
              </Button>
              <ScanButton
                onPress={scanBatch}
                disabled={isScanning}
                isScannerAttached={!!batchScanner}
              />
            </MainNav>
            <ElectionInfoBar
              mode="admin"
              electionDefinition={electionDefinition}
              codeVersion={machineConfig.codeVersion}
              machineId={machineConfig.machineId}
            />
          </Screen>
          {isExportingCvrs && (
            <ExportResultsModal onClose={() => setIsExportingCvrs(false)} />
          )}
        </Route>
      </Switch>
    </AppContext.Provider>
  );
}
