import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Route, Switch, useHistory } from 'react-router-dom';
import {
  UserRole,
  ElectionDefinition,
  MarkThresholds,
  Optional,
  safeParseJson,
} from '@votingworks/types';
import styled from 'styled-components';

import {
  ScannerStatus,
  GetScanStatusResponse,
  GetScanStatusResponseSchema,
  ScanBatchResponseSchema,
  ScanContinueRequest,
  ScanContinueResponseSchema,
  ZeroResponseSchema,
} from '@votingworks/types/api/services/scan';
import {
  usbstick,
  KioskStorage,
  LocalStorage,
  Card,
  Hardware,
  assert,
} from '@votingworks/utils';
import {
  ElectionInfoBar,
  fontSizeTheme,
  Main,
  Prose,
  RebootFromUsbButton,
  Screen,
  SetupCardReaderPage,
  UsbControllerButton,
  useDevices,
  useSmartcard,
  useUsbDrive,
  useUserSession,
} from '@votingworks/ui';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { MachineConfig } from './config/types';
import { AppContext, AppContextInterface } from './contexts/app_context';

import { Button } from './components/button';
import { Text } from './components/text';
import { ScanButton } from './components/scan_button';
import { useInterval } from './hooks/use_interval';

import { LoadElectionScreen } from './screens/load_election_screen';
import { DashboardScreen } from './screens/dashboard_screen';
import { BallotEjectScreen } from './screens/ballot_eject_screen';
import { AdminActionsScreen } from './screens/admin_actions_screen';

import 'normalize.css';
import './App.css';
import { download } from './util/download';
import * as config from './api/config';
import { LinkButton } from './components/link_button';
import { MainNav } from './components/main_nav';

import { ExportResultsModal } from './components/export_results_modal';
import { machineConfigProvider } from './util/machine_config';
import { MachineLockedScreen } from './screens/machine_locked_screen';
import { InvalidCardScreen } from './screens/invalid_card_screen';
import { UnlockMachineScreen } from './screens/unlock_machine_screen';

const Buttons = styled.div`
  padding: 10px 0;
  & * {
    margin-right: 10px;
  }
`;
const VALID_USERS: readonly UserRole[] = ['admin', 'superadmin'];

export interface AppRootProps {
  card: Card;
  hardware: Hardware;
  bypassAuthentication: boolean;
}

export function AppRoot({
  card,
  hardware,
  bypassAuthentication,
}: AppRootProps): JSX.Element {
  const logger = useMemo(
    () => new Logger(LogSource.VxCentralScanFrontend, window.kiosk),
    []
  );
  const history = useHistory();
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [electionDefinition, setElectionDefinition] =
    useState<ElectionDefinition>();
  const [electionJustLoaded, setElectionJustLoaded] = useState(false);
  const [isTestMode, setTestMode] = useState(false);
  const [isTogglingTestMode, setTogglingTestMode] = useState(false);
  const [status, setStatus] = useState<GetScanStatusResponse>({
    canUnconfigure: true,
    batches: [],
    adjudication: { remaining: 0, adjudicated: 0 },
    scanner: ScannerStatus.Unknown,
  });
  const currentNumberOfBallots = status.batches.reduce(
    (prev, next) => prev + next.count,
    0
  );

  const [machineConfig, setMachineConfig] = useState<MachineConfig>({
    machineId: '0000',
    codeVersion: '',
  });

  const usbDrive = useUsbDrive({ logger });

  const { cardReader, batchScanner } = useDevices({
    hardware,
    logger,
  });
  const smartcard = useSmartcard({
    card,
    cardReader,
  });
  const { currentUserSession, attemptToAuthenticateAdminUser, lockMachine } =
    useUserSession({
      smartcard,
      electionDefinition,
      persistAuthentication: true,
      bypassAuthentication,
      logger,
      validUserTypes: VALID_USERS,
    });
  const [isExportingCvrs, setIsExportingCvrs] = useState(false);

  const [markThresholds, setMarkThresholds] =
    useState<Optional<MarkThresholds>>();

  const { adjudication } = status;

  const [isScanning, setIsScanning] = useState(false);
  const [currentScanningBatchId, setCurrentScanningBatchId] =
    useState<string>();
  const [lastScannedSheetIdx, setLastScannedSheetIdx] = useState(0);
  const currentUserType = currentUserSession?.type ?? 'unknown';

  const refreshConfig = useCallback(async () => {
    setElectionDefinition(await config.getElectionDefinition());
    setTestMode(await config.getTestMode());
    setMarkThresholds(await config.getMarkThresholdOverrides());
    await logger.log(LogEventId.ScannerConfigReloaded, currentUserType, {
      message:
        'Loaded election, test mode, and mark threshold information from the scanner service.',
      disposition: 'success',
    });
  }, [logger, currentUserType]);

  function updateElectionDefinition(e: ElectionDefinition) {
    setElectionDefinition(e);
    void logger.log(LogEventId.ElectionConfigured, currentUserType, {
      message: `Machine configured for election with hash: ${e.electionHash}`,
      disposition: 'success',
      electionHash: e.electionHash,
    });
    setElectionJustLoaded(true);
  }

  useEffect(() => {
    async function initialize() {
      try {
        await refreshConfig();
        setIsConfigLoaded(true);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('failed to initialize:', e);
        window.setTimeout(initialize, 1000);
      }
    }

    void initialize();
  }, [refreshConfig]);

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
        void logger.log(LogEventId.ScanSheetComplete, currentUserType, {
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
      void logger.log(LogEventId.ScanSheetComplete, currentUserType, {
        disposition: 'success',
        message: `Sheet number ${currentBatch.count} in batch ${currentScanningBatchId} scanned successfully`,
        batchId: currentScanningBatchId,
        sheetCount: currentBatch.count,
      });
    }

    if (currentBatch.endedAt !== undefined) {
      void logger.log(LogEventId.ScanBatchComplete, currentUserType, {
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
    currentUserType,
    lastScannedSheetIdx,
  ]);

  const updateStatus = useCallback(async () => {
    try {
      const body = await (await fetch('/scan/status')).text();
      const newStatus = safeParseJson(
        body,
        GetScanStatusResponseSchema
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

  const unconfigureServer = useCallback(async () => {
    try {
      await config.setElection(undefined);
      await refreshConfig();
      await logger.log(LogEventId.ElectionUnconfigured, currentUserType, {
        disposition: 'success',
        message:
          'User successfully unconfigured the machine to remove the current election and all current ballot data.',
      });
      history.replace('/');
    } catch (error) {
      console.log('failed unconfigureServer()', error); // eslint-disable-line no-console
      await logger.log(LogEventId.ElectionUnconfigured, currentUserType, {
        disposition: 'failure',
        message: 'Error in unconfiguring the current election on the machine',
        result: 'Election not changed.',
      });
    }
  }, [history, refreshConfig, logger, currentUserType]);

  const scanBatch = useCallback(async () => {
    setIsScanning(true);
    try {
      const result = safeParseJson(
        await (
          await fetch('/scan/scanBatch', {
            method: 'post',
          })
        ).text(),
        ScanBatchResponseSchema
      ).unsafeUnwrap();
      if (result.status !== 'ok') {
        // eslint-disable-next-line no-alert
        window.alert(`could not scan: ${JSON.stringify(result.errors)}`);
        await logger.log(LogEventId.ScanBatchInit, currentUserType, {
          disposition: 'failure',
          message: 'Failed to start scanning a new batch.',
          error: JSON.stringify(result.errors),
          result: 'Scanning not begun.',
        });
        setIsScanning(false);
      } else {
        setCurrentScanningBatchId(result.batchId);
        await logger.log(LogEventId.ScanBatchInit, currentUserType, {
          disposition: 'success',
          message: `User has begun scanning a new batch with ID: ${result.batchId}`,
          batchId: result.batchId,
        });
      }
    } catch (error) {
      assert(error instanceof Error);
      console.log('failed handleFileInput()', error); // eslint-disable-line no-console
      await logger.log(LogEventId.ScanBatchInit, currentUserType, {
        disposition: 'failure',
        message: 'Failed to start scanning a new batch.',
        error: error.message,
        result: 'Scanning not begun.',
      });
    }
  }, [logger, currentUserType]);

  const continueScanning = useCallback(
    async (request: ScanContinueRequest) => {
      setIsScanning(true);
      try {
        const result = safeParseJson(
          await (
            await fetch('/scan/scanContinue', {
              method: 'post',
              body: JSON.stringify(request),
              headers: {
                'Content-Type': 'application/json',
              },
            })
          ).text(),
          ScanContinueResponseSchema
        ).unsafeUnwrap();
        if (result.status === 'ok') {
          await logger.log(LogEventId.ScanBatchContinue, currentUserType, {
            disposition: 'success',
            message: request.forceAccept
              ? 'Sheet tabulated with warnings and scanning of batch continued.'
              : 'User indicated removing the sheet from tabulation and scanning continued without sheet.',
            sheetRemoved: !request.forceAccept,
          });
        } else {
          await logger.log(LogEventId.ScanBatchContinue, currentUserType, {
            disposition: 'failure',
            message: 'Request to continue scanning failed.',
            error: JSON.stringify(result.errors),
            result: 'Scanning not continued, user asked to try again.',
          });
        }
      } catch (error) {
        assert(error instanceof Error);
        console.log('failed handleFileInput()', error); // eslint-disable-line no-console
        await logger.log(LogEventId.ScanBatchContinue, currentUserType, {
          disposition: 'failure',
          message: 'Request to continue scanning failed.',
          error: error.message,
          result: 'Scanning not continued, user asked to try again.',
        });
      }
    },
    [logger, currentUserType]
  );

  const zeroData = useCallback(async () => {
    try {
      await logger.log(LogEventId.ClearingBallotData, currentUserType, {
        message: `Removing all ballot data, clearing ${currentNumberOfBallots} ballots.`,
        currentNumberOfBallots,
      });
      safeParseJson(
        await (
          await fetch('/scan/zero', {
            method: 'post',
          })
        ).text(),
        ZeroResponseSchema
      ).unsafeUnwrap();
      await refreshConfig();
      await logger.log(LogEventId.ClearedBallotData, currentUserType, {
        disposition: 'success',
        message: 'Successfully cleared all ballot data.',
      });
      history.replace('/');
    } catch (error) {
      assert(error instanceof Error);
      console.log('failed zeroData()', error); // eslint-disable-line no-console
      await logger.log(LogEventId.ClearedBallotData, currentUserType, {
        disposition: 'failure',
        message: `Error clearing ballot data: ${error.message}`,
        result: 'Ballot data not cleared.',
      });
    }
  }, [history, logger, currentUserType, currentNumberOfBallots, refreshConfig]);

  const backup = useCallback(async () => {
    await download('/scan/backup');
  }, []);

  const toggleTestMode = useCallback(async () => {
    try {
      setTogglingTestMode(true);
      await logger.log(LogEventId.TogglingTestMode, currentUserType, {
        message: `Toggling to ${isTestMode ? 'Live' : 'Test'} Mode...`,
      });
      await config.setTestMode(!isTestMode);
      await refreshConfig();
      await logger.log(LogEventId.ToggledTestMode, currentUserType, {
        disposition: 'success',
        message: `Successfully toggled to ${isTestMode ? 'Live' : 'Test'} Mode`,
      });
      history.replace('/');
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.ToggledTestMode, currentUserType, {
        disposition: 'failure',
        message: `Error toggling to ${isTestMode ? 'Live' : 'Test'} Mode: ${
          error.message
        }`,
        result: 'Mode not changed, user shown error.',
      });
    } finally {
      setTogglingTestMode(false);
    }
  }, [history, isTestMode, refreshConfig, logger, currentUserType]);

  const setMarkThresholdOverrides = useCallback(
    async (markThresholdOverrides?: MarkThresholds) => {
      await config.setMarkThresholdOverrides(markThresholdOverrides);
      await refreshConfig();
      history.replace('/');
    },
    [history, refreshConfig]
  );

  const deleteBatch = useCallback(
    async (id: string) => {
      try {
        const batch = status.batches.find((b) => b.id === id);
        const numberOfBallotsInBatch = batch?.count ?? 0;
        await logger.log(LogEventId.DeleteScanBatchInit, currentUserType, {
          message: `User deleting batch id ${id}...`,
          numberOfBallotsInBatch,
          batchId: id,
        });
        await fetch(`/scan/batch/${id}`, {
          method: 'DELETE',
        });
        await logger.log(LogEventId.DeleteScanBatchComplete, currentUserType, {
          disposition: 'success',
          message: `User successfully deleted batch id: ${id} containing ${numberOfBallotsInBatch} ballots.`,
          numberOfBallotsInBatch,
          batchId: id,
        });
      } catch (error) {
        assert(error instanceof Error);
        await logger.log(LogEventId.DeleteScanBatchComplete, currentUserType, {
          disposition: 'failure',
          message: `Error deleting batch id: ${id}.`,
          error: error.message,
          result: 'Batch not deleted, user shown error.',
        });
        throw error;
      }
    },
    [logger, currentUserType, status.batches]
  );

  useInterval(
    useCallback(async () => {
      if (electionDefinition) {
        await updateStatus();
      }
    }, [electionDefinition, updateStatus]),
    1000
  );

  const displayUsbStatus = usbDrive.status ?? usbstick.UsbDriveStatus.absent;

  useEffect(() => {
    void updateStatus();
  }, [updateStatus]);

  useEffect(() => {
    if (
      electionJustLoaded &&
      displayUsbStatus === usbstick.UsbDriveStatus.recentlyEjected
    ) {
      setElectionJustLoaded(false);
    }
  }, [electionJustLoaded, displayUsbStatus]);

  const storage = window.kiosk
    ? new KioskStorage(window.kiosk)
    : new LocalStorage();

  if (!cardReader) {
    return <SetupCardReaderPage usePollWorkerLanguage={false} />;
  }
  const currentContext: AppContextInterface = {
    usbDriveStatus: displayUsbStatus,
    usbDriveEject: usbDrive.eject,
    electionDefinition,
    machineConfig,
    storage,
    lockMachine,
    currentUserSession,
    logger,
  };

  if (!currentUserSession) {
    return (
      <AppContext.Provider value={currentContext}>
        <MachineLockedScreen />
      </AppContext.Provider>
    );
  }

  if (currentUserSession.type === 'superadmin') {
    return (
      <AppContext.Provider value={currentContext}>
        <Screen flexDirection="column">
          <Main padded centerChild>
            <Prose theme={fontSizeTheme.large}>
              <RebootFromUsbButton
                usbDriveStatus={displayUsbStatus}
                logger={logger}
              />
            </Prose>
          </Main>
          <ElectionInfoBar
            mode="admin"
            electionDefinition={electionDefinition}
            codeVersion={machineConfig.codeVersion}
            machineId={machineConfig.machineId}
          />
        </Screen>
      </AppContext.Provider>
    );
  }

  if (currentUserSession.type !== 'admin') {
    return (
      <AppContext.Provider value={currentContext}>
        <InvalidCardScreen />
      </AppContext.Provider>
    );
  }

  if (!currentUserSession.authenticated) {
    return (
      <AppContext.Provider value={currentContext}>
        <UnlockMachineScreen
          attemptToAuthenticateAdminUser={attemptToAuthenticateAdminUser}
        />
      </AppContext.Provider>
    );
  }

  if (electionDefinition) {
    if (electionJustLoaded) {
      return (
        <AppContext.Provider value={currentContext}>
          <Screen flexDirection="column">
            <Main padded centerChild>
              <div>
                <Prose>
                  <h1>Successfully Configured</h1>
                  <Text>You may now eject the USB drive.</Text>
                </Prose>
                <Buttons>
                  <Button onPress={() => setElectionJustLoaded(false)}>
                    Close
                  </Button>
                  <UsbControllerButton
                    small={false}
                    primary
                    usbDriveStatus={displayUsbStatus}
                    usbDriveEject={() =>
                      usbDrive.eject(currentUserSession.type)
                    }
                  />
                </Buttons>
              </div>
            </Main>
            <MainNav isTestMode={false}>
              <Button small onPress={lockMachine}>
                Lock Machine
              </Button>
            </MainNav>
          </Screen>
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

    let exportButtonTitle;
    if (adjudication.remaining > 0) {
      exportButtonTitle =
        'You cannot export results until all ballots have been adjudicated.';
    } else if (status.batches.length === 0) {
      exportButtonTitle =
        'You cannot export results until you have scanned at least 1 ballot.';
    }

    return (
      <AppContext.Provider value={currentContext}>
        <Switch>
          <Route path="/admin">
            <AdminActionsScreen
              unconfigureServer={unconfigureServer}
              zeroData={zeroData}
              backup={backup}
              hasBatches={status.batches.length > 0}
              isTestMode={isTestMode}
              toggleTestMode={toggleTestMode}
              canUnconfigure={status.canUnconfigure}
              setMarkThresholdOverrides={setMarkThresholdOverrides}
              markThresholds={markThresholds}
              isTogglingTestMode={isTogglingTestMode}
              electionDefinition={electionDefinition}
            />
          </Route>
          <Route path="/">
            <Screen flexDirection="column">
              <Main padded>
                <DashboardScreen
                  isScanning={isScanning}
                  status={status}
                  deleteBatch={deleteBatch}
                />
              </Main>
              <MainNav isTestMode={isTestMode}>
                <UsbControllerButton
                  usbDriveStatus={displayUsbStatus}
                  usbDriveEject={() => usbDrive.eject(currentUserSession.type)}
                />
                <Button small onPress={lockMachine}>
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
                  title={exportButtonTitle}
                >
                  Export
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
              <ExportResultsModal
                onClose={() => setIsExportingCvrs(false)}
                electionDefinition={electionDefinition}
                isTestMode={isTestMode}
                numberOfBallots={currentNumberOfBallots}
              />
            )}
          </Route>
        </Switch>
      </AppContext.Provider>
    );
  }

  if (isConfigLoaded) {
    return (
      <AppContext.Provider value={currentContext}>
        <LoadElectionScreen setElectionDefinition={updateElectionDefinition} />
      </AppContext.Provider>
    );
  }

  return (
    <Screen flexDirection="column">
      <Main padded centerChild>
        <h1>Loading Configuration...</h1>
      </Main>
    </Screen>
  );
}
