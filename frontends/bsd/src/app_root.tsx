import React, { useEffect, useState, useCallback } from 'react';
import { Route, Switch, useHistory } from 'react-router-dom';
import {
  ElectionDefinition,
  MarkThresholds,
  Optional,
  safeParseJson,
} from '@votingworks/types';
import styled from 'styled-components';

import { Scan } from '@votingworks/api';
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
  isSystemAdministratorAuth,
  Main,
  Prose,
  UnlockMachineScreen,
  InvalidCardScreen,
  RemoveCardScreen,
  Screen,
  SetupCardReaderPage,
  SystemAdministratorScreenContents,
  Text,
  UsbControllerButton,
  useDevices,
  useDippedSmartcardAuth,
  useUsbDrive,
} from '@votingworks/ui';
import { LogEventId, Logger } from '@votingworks/logging';
import { MachineConfig } from './config/types';
import { AppContext, AppContextInterface } from './contexts/app_context';

import { Button } from './components/button';
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

const Buttons = styled.div`
  padding: 10px 0;
  & * {
    margin-right: 10px;
  }
`;

export interface AppRootProps {
  card: Card;
  hardware: Hardware;
  logger: Logger;
}

export function AppRoot({ card, hardware, logger }: AppRootProps): JSX.Element {
  const history = useHistory();
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [electionDefinition, setElectionDefinition] =
    useState<ElectionDefinition>();
  const [electionJustLoaded, setElectionJustLoaded] = useState(false);
  const [isTestMode, setTestMode] = useState(false);
  const [isTogglingTestMode, setTogglingTestMode] = useState(false);
  const [status, setStatus] = useState<Scan.GetScanStatusResponse>({
    canUnconfigure: true,
    batches: [],
    adjudication: { remaining: 0, adjudicated: 0 },
    scanner: Scan.ScannerStatus.Unknown,
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
  const auth = useDippedSmartcardAuth({
    cardApi: card,
    logger,
    scope: {
      // By default with dipped smartcard auth, only system administrators have this ability
      allowElectionManagersToAccessUnconfiguredMachines: true,
      electionDefinition,
    },
  });
  const userRole = auth.status === 'logged_in' ? auth.user.role : 'unknown';

  const [isExportingCvrs, setIsExportingCvrs] = useState(false);

  const [markThresholds, setMarkThresholds] =
    useState<Optional<MarkThresholds>>();

  const { adjudication } = status;

  const [isScanning, setIsScanning] = useState(false);
  const [currentScanningBatchId, setCurrentScanningBatchId] =
    useState<string>();
  const [lastScannedSheetIdx, setLastScannedSheetIdx] = useState(0);

  const refreshConfig = useCallback(async () => {
    setElectionDefinition(await config.getElectionDefinition());
    setTestMode(await config.getTestMode());
    setMarkThresholds(await config.getMarkThresholdOverrides());
    await logger.log(LogEventId.ScannerConfigReloaded, userRole, {
      message:
        'Loaded election, test mode, and mark threshold information from the scanner service.',
      disposition: 'success',
    });
  }, [logger, userRole]);

  function updateElectionDefinition(e: ElectionDefinition) {
    setElectionDefinition(e);
    void logger.log(LogEventId.ElectionConfigured, userRole, {
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
      const body = await (await fetch('/scan/status')).text();
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

  const unconfigureServer = useCallback(async () => {
    try {
      await config.setElection(undefined);
      await refreshConfig();
      await logger.log(LogEventId.ElectionUnconfigured, userRole, {
        disposition: 'success',
        message:
          'User successfully unconfigured the machine to remove the current election and all current ballot data.',
      });
      history.replace('/');
    } catch (error) {
      console.log('failed unconfigureServer()', error); // eslint-disable-line no-console
      await logger.log(LogEventId.ElectionUnconfigured, userRole, {
        disposition: 'failure',
        message: 'Error in unconfiguring the current election on the machine',
        result: 'Election not changed.',
      });
    }
  }, [history, refreshConfig, logger, userRole]);

  const scanBatch = useCallback(async () => {
    setIsScanning(true);
    try {
      const result = safeParseJson(
        await (
          await fetch('/scan/scanBatch', {
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
            await fetch('/scan/scanContinue', {
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

  const zeroData = useCallback(async () => {
    try {
      await logger.log(LogEventId.ClearingBallotData, userRole, {
        message: `Removing all ballot data, clearing ${currentNumberOfBallots} ballots.`,
        currentNumberOfBallots,
      });
      safeParseJson(
        await (
          await fetch('/scan/zero', {
            method: 'post',
          })
        ).text(),
        Scan.ZeroResponseSchema
      ).unsafeUnwrap();
      await refreshConfig();
      await logger.log(LogEventId.ClearedBallotData, userRole, {
        disposition: 'success',
        message: 'Successfully cleared all ballot data.',
      });
      history.replace('/');
    } catch (error) {
      assert(error instanceof Error);
      console.log('failed zeroData()', error); // eslint-disable-line no-console
      await logger.log(LogEventId.ClearedBallotData, userRole, {
        disposition: 'failure',
        message: `Error clearing ballot data: ${error.message}`,
        result: 'Ballot data not cleared.',
      });
    }
  }, [history, logger, userRole, currentNumberOfBallots, refreshConfig]);

  const backup = useCallback(async () => {
    await download('/scan/backup');
    if (window.kiosk) {
      // Backups can take several minutes. Ensure the data is flushed to the
      // usb before prompting the user to eject it.
      await usbstick.doSync();
    }
  }, []);

  const toggleTestMode = useCallback(async () => {
    try {
      setTogglingTestMode(true);
      await logger.log(LogEventId.TogglingTestMode, userRole, {
        message: `Toggling to ${isTestMode ? 'Live' : 'Test'} Mode...`,
      });
      await config.setTestMode(!isTestMode);
      await refreshConfig();
      await logger.log(LogEventId.ToggledTestMode, userRole, {
        disposition: 'success',
        message: `Successfully toggled to ${isTestMode ? 'Live' : 'Test'} Mode`,
      });
      history.replace('/');
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.ToggledTestMode, userRole, {
        disposition: 'failure',
        message: `Error toggling to ${isTestMode ? 'Live' : 'Test'} Mode: ${
          error.message
        }`,
        result: 'Mode not changed, user shown error.',
      });
    } finally {
      setTogglingTestMode(false);
    }
  }, [history, isTestMode, refreshConfig, logger, userRole]);

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
        await logger.log(LogEventId.DeleteScanBatchInit, userRole, {
          message: `User deleting batch id ${id}...`,
          numberOfBallotsInBatch,
          batchId: id,
        });
        await fetch(`/scan/batch/${id}`, {
          method: 'DELETE',
        });
        await logger.log(LogEventId.DeleteScanBatchComplete, userRole, {
          disposition: 'success',
          message: `User successfully deleted batch id: ${id} containing ${numberOfBallotsInBatch} ballots.`,
          numberOfBallotsInBatch,
          batchId: id,
        });
      } catch (error) {
        assert(error instanceof Error);
        await logger.log(LogEventId.DeleteScanBatchComplete, userRole, {
          disposition: 'failure',
          message: `Error deleting batch id: ${id}.`,
          error: error.message,
          result: 'Batch not deleted, user shown error.',
        });
        throw error;
      }
    },
    [logger, userRole, status.batches]
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
    logger,
    auth,
  };

  if (auth.status === 'logged_out') {
    if (auth.reason === 'machine_locked') {
      return (
        <AppContext.Provider value={currentContext}>
          <MachineLockedScreen />
        </AppContext.Provider>
      );
    }
    if (auth.reason === 'machine_not_configured') {
      return (
        <InvalidCardScreen
          reason={auth.reason}
          recommendedAction="Please insert an Election Manager card."
        />
      );
    }
    return <InvalidCardScreen reason={auth.reason} />;
  }

  if (auth.status === 'checking_passcode') {
    return <UnlockMachineScreen auth={auth} />;
  }

  if (auth.status === 'remove_card') {
    return <RemoveCardScreen />;
  }

  if (isSystemAdministratorAuth(auth)) {
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
            unconfigureMachine={unconfigureServer}
            usbDriveStatus={displayUsbStatus}
          />
          <ElectionInfoBar
            mode="admin"
            electionDefinition={electionDefinition}
            codeVersion={machineConfig.codeVersion}
            machineId={machineConfig.machineId}
          />
          <MainNav>
            <Button small onPress={() => auth.logOut()}>
              Lock Machine
            </Button>
          </MainNav>
        </Screen>
      </AppContext.Provider>
    );
  }

  if (electionDefinition) {
    if (electionJustLoaded) {
      return (
        <AppContext.Provider value={currentContext}>
          <Screen>
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
                    usbDriveEject={() => usbDrive.eject(userRole)}
                  />
                </Buttons>
              </div>
            </Main>
            <MainNav isTestMode={false}>
              <Button small onPress={() => auth.logOut()}>
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
            <Screen>
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
                  usbDriveEject={() => usbDrive.eject(userRole)}
                />
                <Button small onPress={() => auth.logOut()}>
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
                  Save Results
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
    <Screen>
      <Main padded centerChild>
        <h1>Loading Configuration...</h1>
      </Main>
    </Screen>
  );
}
