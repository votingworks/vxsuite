import * as grout from '@votingworks/grout';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  ElectionPackageConfigurationError,
  DEFAULT_SYSTEM_SETTINGS,
  ExportCastVoteRecordsToUsbDriveError,
  PrecinctSelection,
  PrinterStatus,
  SinglePrecinctSelection,
} from '@votingworks/types';
import {
  getPollsTransitionDestinationState,
  getPrecinctSelectionName,
  isElectionManagerAuth,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import express, { Application } from 'express';
import {
  createUiStringsApi,
  createSystemCallApi,
  readSignedElectionPackageFromUsb,
  exportCastVoteRecordsToUsbDrive,
  doesUsbDriveRequireCastVoteRecordSync as doesUsbDriveRequireCastVoteRecordSyncFn,
  configureUiStrings,
} from '@votingworks/backend';
import {
  assert,
  assertDefined,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { InsertedSmartCardAuthApi, LiveCheck } from '@votingworks/auth';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { Printer } from '@votingworks/printing';
import {
  PrecinctScannerStateMachine,
  PrecinctScannerConfig,
  PrecinctScannerStatus,
  PollsTransition,
  PrecinctScannerPollsInfo,
} from './types';
import { constructAuthMachineState } from './util/auth';
import { Workspace } from './util/workspace';
import { getMachineConfig } from './machine_config';
import { printReport } from './print_report';
import { logPollsTransition } from './util/logging';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi({
  auth,
  machine,
  workspace,
  usbDrive,
  printer,
  logger,
}: {
  auth: InsertedSmartCardAuthApi;
  machine: PrecinctScannerStateMachine;
  workspace: Workspace;
  usbDrive: UsbDrive;
  printer: Printer;
  logger: Logger;
}) {
  const { store } = workspace;

  return grout.createApi({
    getMachineConfig,

    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(workspace.store));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(workspace.store), input);
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(workspace.store));
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(
        constructAuthMachineState(workspace.store),
        input
      );
    },

    generateLiveCheckQrCodeValue() {
      const { machineId } = getMachineConfig();
      const electionDefinition = workspace.store.getElectionDefinition();
      return new LiveCheck().generateQrCodeValue({
        machineId,
        electionHash: electionDefinition?.electionHash,
      });
    },

    async getUsbDriveStatus(): Promise<
      UsbDriveStatus & { doesUsbDriveRequireCastVoteRecordSync?: true }
    > {
      const usbDriveStatus = await usbDrive.status();
      return {
        ...usbDriveStatus,
        doesUsbDriveRequireCastVoteRecordSync:
          (await doesUsbDriveRequireCastVoteRecordSyncFn(
            store,
            usbDriveStatus
          )) || undefined,
      };
    },

    async ejectUsbDrive(): Promise<void> {
      return usbDrive.eject();
    },

    async configureFromElectionPackageOnUsbDrive(): Promise<
      Result<void, ElectionPackageConfigurationError>
    > {
      assert(!store.getElectionDefinition(), 'Already configured');

      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace.store)
      );
      const electionPackageResult = await readSignedElectionPackageFromUsb(
        authStatus,
        usbDrive,
        logger
      );
      if (electionPackageResult.isErr()) {
        return electionPackageResult;
      }
      assert(isElectionManagerAuth(authStatus));
      const electionPackage = electionPackageResult.ok();
      const { electionDefinition, systemSettings } = electionPackage;
      assert(systemSettings);
      let precinctSelection: SinglePrecinctSelection | undefined;
      if (electionDefinition.election.precincts.length === 1) {
        precinctSelection = singlePrecinctSelectionFor(
          electionDefinition.election.precincts[0].id
        );
      }

      store.withTransaction(() => {
        store.setElectionAndJurisdiction({
          electionData: electionDefinition.electionData,
          jurisdiction: authStatus.user.jurisdiction,
        });
        if (precinctSelection) {
          store.setPrecinctSelection(precinctSelection);
        }
        store.setSystemSettings(systemSettings);

        configureUiStrings({
          electionPackage,
          logger,
          noAudio: true,
          store: workspace.store.getUiStringsStore(),
        });
      });

      return ok();
    },

    getConfig(): PrecinctScannerConfig {
      return {
        electionDefinition: store.getElectionDefinition(),
        systemSettings: store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS,
        precinctSelection: store.getPrecinctSelection(),
        isSoundMuted: store.getIsSoundMuted(),
        isTestMode: store.getTestMode(),
        isUltrasonicDisabled:
          !machine.supportsUltrasonic() || store.getIsUltrasonicDisabled(),
        ballotCountWhenBallotBagLastReplaced:
          store.getBallotCountWhenBallotBagLastReplaced(),
      };
    },

    getPollsInfo(): PrecinctScannerPollsInfo {
      const pollsState = store.getPollsState();
      if (pollsState === 'polls_closed_initial') {
        return {
          pollsState,
        };
      }

      return {
        pollsState,
        lastPollsTransition: assertDefined(store.getLastPollsTransition()),
      };
    },

    unconfigureElection(): void {
      workspace.reset();
    },

    async setPrecinctSelection(input: {
      precinctSelection: PrecinctSelection;
    }): Promise<void> {
      const electionDefinition = store.getElectionDefinition();
      assert(electionDefinition);
      assert(
        store.getBallotsCounted() === 0,
        'Attempt to change precinct selection after ballots have been cast'
      );
      store.setPrecinctSelection(input.precinctSelection);
      workspace.resetElectionSession();
      await logger.logAsCurrentRole(LogEventId.PrecinctConfigurationChanged, {
        disposition: 'success',
        message: `User set the precinct for the machine to ${getPrecinctSelectionName(
          electionDefinition.election.precincts,
          input.precinctSelection
        )}`,
      });
    },

    setIsSoundMuted(input: { isSoundMuted: boolean }): void {
      store.setIsSoundMuted(input.isSoundMuted);
    },

    setIsUltrasonicDisabled(input: { isUltrasonicDisabled: boolean }): void {
      store.setIsUltrasonicDisabled(input.isUltrasonicDisabled);
    },

    async setTestMode(input: { isTestMode: boolean }): Promise<void> {
      // Use the continuous export mutex to ensure that any pending continuous export operations
      // finish first
      await workspace.continuousExportMutex.withLock(() =>
        workspace.resetElectionSession()
      );
      store.setTestMode(input.isTestMode);
    },

    async transitionPolls(
      input: Omit<PollsTransition, 'ballotCount'>
    ): Promise<void> {
      const previousPollsState = store.getPollsState();
      const newPollsState = getPollsTransitionDestinationState(input.type);

      // Start new batch if opening polls, end batch if pausing or closing polls
      if (
        newPollsState === 'polls_open' &&
        previousPollsState !== 'polls_open'
      ) {
        const batchId = store.addBatch();
        await logger.log(LogEventId.ScannerBatchStarted, 'system', {
          disposition: 'success',
          message:
            'New scanning batch started due to polls being opened or voting being resumed.',
          batchId,
        });
      } else if (
        newPollsState !== 'polls_open' &&
        previousPollsState === 'polls_open'
      ) {
        const ongoingBatchId = store.getOngoingBatchId();
        assert(typeof ongoingBatchId === 'string');
        store.finishBatch({ batchId: ongoingBatchId });
        await logger.log(LogEventId.ScannerBatchEnded, 'system', {
          disposition: 'success',
          message:
            'Current scanning batch ended due to polls being closed or voting being paused.',
          batchId: ongoingBatchId,
        });
      }

      await logPollsTransition(logger, input.type, previousPollsState);
      store.transitionPolls(input);
    },

    async recordBallotBagReplaced(): Promise<void> {
      // If polls are open, we need to end current batch and start a new batch
      if (store.getPollsState() === 'polls_open') {
        const ongoingBatchId = store.getOngoingBatchId();
        assert(typeof ongoingBatchId === 'string');
        store.finishBatch({ batchId: ongoingBatchId });
        await logger.log(LogEventId.ScannerBatchEnded, 'system', {
          disposition: 'success',
          message:
            'Current scanning batch ended due to ballot bag replacement.',
          batchId: ongoingBatchId,
        });

        const batchId = store.addBatch();
        await logger.log(LogEventId.ScannerBatchStarted, 'system', {
          disposition: 'success',
          message: 'New scanning batch started due to ballot bag replacement.',
          batchId,
        });
      }

      store.setBallotCountWhenBallotBagLastReplaced(store.getBallotsCounted());
    },

    async exportCastVoteRecordsToUsbDrive(input: {
      mode: 'full_export' | 'polls_closing';
    }): Promise<Result<void, ExportCastVoteRecordsToUsbDriveError>> {
      await logger.logAsCurrentRole(LogEventId.ExportCastVoteRecordsInit, {
        message:
          input.mode === 'polls_closing'
            ? 'Marking cast vote record export as complete on polls close...'
            : 'Exporting cast vote records...',
      });

      // Use the continuous export mutex to ensure that any pending continuous export
      // operations finish first
      let exportResult: Result<void, ExportCastVoteRecordsToUsbDriveError>;
      switch (input.mode) {
        case 'full_export': {
          exportResult = await workspace.continuousExportMutex.withLock(() =>
            exportCastVoteRecordsToUsbDrive(
              store,
              usbDrive,
              store.forEachSheet(),
              { scannerType: 'precinct', isFullExport: true }
            )
          );
          break;
        }
        case 'polls_closing': {
          exportResult = await workspace.continuousExportMutex.withLock(() =>
            exportCastVoteRecordsToUsbDrive(store, usbDrive, [], {
              scannerType: 'precinct',
              arePollsClosing: true,
            })
          );
          break;
        }
        /* c8 ignore start: Compile-time check for completeness */
        default: {
          throwIllegalValue(input.mode);
        }
        /* c8 ignore stop */
      }

      if (exportResult.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ExportCastVoteRecordsComplete,
          {
            disposition: 'failure',
            message:
              input.mode === 'polls_closing'
                ? 'Error marking cast vote record export as complete on polls close.'
                : 'Error exporting cast vote records.',
            errorDetails: JSON.stringify(exportResult.err()),
          }
        );
      } else {
        await logger.logAsCurrentRole(
          LogEventId.ExportCastVoteRecordsComplete,
          {
            disposition: 'success',
            message:
              input.mode === 'polls_closing'
                ? 'Successfully marked cast vote record export as complete on polls close.'
                : 'Successfully exported cast vote records.',
          }
        );
      }
      return exportResult;
    },

    getPrinterStatus(): Promise<PrinterStatus> {
      return printer.status();
    },

    async printReport(): Promise<number> {
      const numPages = await printReport({ store, printer });
      return numPages;
    },

    getScannerStatus(): PrecinctScannerStatus {
      const machineStatus = machine.status();
      const ballotsCounted = store.getBallotsCounted();
      return {
        ...machineStatus,
        ballotsCounted,
      };
    },

    acceptBallot(): void {
      machine.accept();
    },

    returnBallot(): void {
      machine.return();
    },

    supportsUltrasonic(): boolean {
      return machine.supportsUltrasonic();
    },

    ...createUiStringsApi({
      logger,
      store: workspace.store.getUiStringsStore(),
    }),

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId: getMachineConfig().machineId,
    }),
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp({
  auth,
  machine,
  workspace,
  usbDrive,
  printer,
  logger,
}: {
  auth: InsertedSmartCardAuthApi;
  machine: PrecinctScannerStateMachine;
  workspace: Workspace;
  printer: Printer;
  usbDrive: UsbDrive;
  logger: Logger;
}): Application {
  const app: Application = express();
  const api = buildApi({ auth, machine, workspace, usbDrive, printer, logger });
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express, 'scan');
  return app;
}
