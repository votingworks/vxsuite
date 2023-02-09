import * as grout from '@votingworks/grout';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  CastVoteRecord,
  MarkThresholds,
  PollsState,
  PrecinctSelection,
  SinglePrecinctSelection,
} from '@votingworks/types';
import {
  BALLOT_PACKAGE_FOLDER,
  readBallotPackageFromBuffer,
  ScannerReportData,
  ScannerReportDataSchema,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import express, { Application } from 'express';
import * as fs from 'fs/promises';
import { ExportDataError } from '@votingworks/data';
import path from 'path';
import { existsSync } from 'fs';
import { assert, err, ok, Result } from '@votingworks/basics';
import {
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { backupToUsbDrive } from './backup';
import {
  exportCastVoteRecords,
  exportCastVoteRecordsToUsbDrive,
} from './cvrs/export';
import { PrecinctScannerInterpreter } from './interpret';
import { PrecinctScannerStateMachine } from './state_machine';
import { Workspace } from './util/workspace';
import { Usb } from './util/usb';
import {
  ConfigurationError,
  PrecinctScannerConfig,
  PrecinctScannerStatus,
} from './types';
import { getMachineConfig } from './machine_config';

function constructInsertedSmartCardAuthMachineState(
  workspace: Workspace
): InsertedSmartCardAuthMachineState {
  const electionDefinition = workspace.store.getElectionDefinition();
  return { electionDefinition };
}

function buildApi(
  auth: InsertedSmartCardAuthApi,
  machine: PrecinctScannerStateMachine,
  interpreter: PrecinctScannerInterpreter,
  workspace: Workspace,
  usb: Usb,
  logger: Logger
) {
  const { store } = workspace;

  return grout.createApi({
    getMachineConfig,

    getAuthStatus: () =>
      auth.getAuthStatus(constructInsertedSmartCardAuthMachineState(workspace)),

    checkPin: (input: { pin: string }) =>
      auth.checkPin(
        constructInsertedSmartCardAuthMachineState(workspace),
        input
      ),

    async configureFromBallotPackageOnUsbDrive(): Promise<
      Result<void, ConfigurationError>
    > {
      assert(!store.getElectionDefinition(), 'Already configured');
      const [usbDrive] = await usb.getUsbDrives();
      assert(usbDrive?.mountPoint !== undefined, 'No USB drive mounted');

      const directoryPath = path.join(
        usbDrive.mountPoint,
        BALLOT_PACKAGE_FOLDER
      );
      if (!existsSync(directoryPath)) {
        return err('no_ballot_package_on_usb_drive');
      }

      const files = await fs.readdir(directoryPath, { withFileTypes: true });
      const ballotPackageFiles = files.filter(
        (file) => file.isFile() && file.name.endsWith('.zip')
      );
      if (ballotPackageFiles.length === 0) {
        return err('no_ballot_package_on_usb_drive');
      }

      const ballotPackageFilesWithStats = await Promise.all(
        ballotPackageFiles.map(async (file) => {
          const filePath = path.join(directoryPath, file.name);
          return {
            ...file,
            filePath,
            // Include file stats so we can sort by creation time
            ...(await fs.lstat(filePath)),
          };
        })
      );

      const [mostRecentBallotPackageFile] = [
        ...ballotPackageFilesWithStats,
      ].sort((a, b) => b.ctime.getTime() - a.ctime.getTime());

      const ballotPackage = await readBallotPackageFromBuffer(
        await fs.readFile(mostRecentBallotPackageFile.filePath)
      );

      const { electionDefinition, ballots } = ballotPackage;

      // If the election has only one precinct, set it automatically
      let precinctSelection: SinglePrecinctSelection | undefined;
      if (electionDefinition.election.precincts.length === 1) {
        precinctSelection = singlePrecinctSelectionFor(
          electionDefinition.election.precincts[0].id
        );
      }

      await store.withTransaction(async () => {
        store.setElection(electionDefinition.electionData);
        if (precinctSelection) {
          store.setPrecinctSelection(precinctSelection);
        }
        await store.setHmpbTemplates(ballots);
      });

      return ok();
    },

    getConfig(): PrecinctScannerConfig {
      return {
        electionDefinition: store.getElectionDefinition(),
        precinctSelection: store.getPrecinctSelection(),
        markThresholdOverrides: store.getMarkThresholdOverrides(),
        isSoundMuted: store.getIsSoundMuted(),
        isTestMode: store.getTestMode(),
        pollsState: store.getPollsState(),
        ballotCountWhenBallotBagLastReplaced:
          store.getBallotCountWhenBallotBagLastReplaced(),
      };
    },

    unconfigureElection(input: { ignoreBackupRequirement?: boolean }): void {
      assert(
        input.ignoreBackupRequirement || store.getCanUnconfigure(),
        'Attempt to unconfigure without backup'
      );
      interpreter.unconfigure();
      workspace.reset();
    },

    setPrecinctSelection(input: {
      precinctSelection: PrecinctSelection;
    }): void {
      assert(
        store.getBallotsCounted() === 0,
        'Attempt to change precinct selection after ballots have been cast'
      );
      store.setPrecinctSelection(input.precinctSelection);
      workspace.resetElectionSession();
    },

    setMarkThresholdOverrides(input: {
      markThresholdOverrides?: MarkThresholds;
    }): void {
      store.setMarkThresholdOverrides(input.markThresholdOverrides);
    },

    setIsSoundMuted(input: { isSoundMuted: boolean }): void {
      store.setIsSoundMuted(input.isSoundMuted);
    },

    setTestMode(input: { isTestMode: boolean }): void {
      workspace.resetElectionSession();
      store.setTestMode(input.isTestMode);
    },

    async setPollsState(input: { pollsState: PollsState }): Promise<void> {
      const previousPollsState = store.getPollsState();
      const newPollsState = input.pollsState;

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

      store.setPollsState(newPollsState);
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

    async backupToUsbDrive(): Promise<Result<void, ExportDataError>> {
      return await backupToUsbDrive(store, usb);
    },

    async exportCastVoteRecordsToUsbDrive(): Promise<
      Result<void, ExportDataError>
    > {
      return await exportCastVoteRecordsToUsbDrive(
        store,
        usb,
        getMachineConfig().machineId
      );
    },

    /**
     * @deprecated We want to eventually build the tally in the backend,
     * but for now that logic still lives in the frontend.
     */
    async getCastVoteRecordsForTally(): Promise<CastVoteRecord[]> {
      const castVoteRecords: CastVoteRecord[] = [];
      for await (const castVoteRecord of exportCastVoteRecords({
        store,
        skipImages: true,
      })) {
        castVoteRecords.push(castVoteRecord);
      }
      return castVoteRecords;
    },

    getScannerStatus(): PrecinctScannerStatus {
      const machineStatus = machine.status();
      const ballotsCounted = store.getBallotsCounted();
      const canUnconfigure = store.getCanUnconfigure();
      return {
        ...machineStatus,
        ballotsCounted,
        canUnconfigure,
      };
    },

    async scanBallot(): Promise<void> {
      assert(store.getPollsState() === 'polls_open');
      const electionDefinition = store.getElectionDefinition();
      const precinctSelection = store.getPrecinctSelection();
      const layouts = await store.loadLayouts();
      assert(electionDefinition);
      assert(precinctSelection);
      assert(layouts);
      interpreter.configure({
        electionDefinition,
        precinctSelection,
        layouts,
        testMode: store.getTestMode(),
        markThresholdOverrides: store.getMarkThresholdOverrides(),
        ballotImagesPath: workspace.ballotImagesPath,
      });
      machine.scan();
    },

    acceptBallot(): void {
      machine.accept();
    },

    returnBallot(): void {
      machine.return();
    },

    supportsCalibration(): boolean {
      return true;
    },

    async calibrate(): Promise<boolean> {
      const result = await machine.calibrate?.();
      return result?.isOk() ?? false;
    },

    async saveScannerReportDataToCard({
      scannerReportData,
    }: {
      scannerReportData: ScannerReportData;
    }): Promise<Result<void, Error>> {
      const machineState =
        constructInsertedSmartCardAuthMachineState(workspace);
      const authStatus = await auth.getAuthStatus(machineState);

      // Though we only initiate this action when a poll worker is logged in, a poll worker could
      // remove their card right after, so we treat these as user errors rather than unexpected
      // errors
      if (authStatus.status !== 'logged_in') {
        return err(new Error('User is not logged in'));
      }
      if (authStatus.user.role !== 'poll_worker') {
        return err(new Error('User is not a poll worker'));
      }

      return await auth.writeCardData(machineState, {
        data: scannerReportData,
        schema: ScannerReportDataSchema,
      });
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(
  auth: InsertedSmartCardAuthApi,
  machine: PrecinctScannerStateMachine,
  interpreter: PrecinctScannerInterpreter,
  workspace: Workspace,
  usb: Usb,
  logger: Logger
): Application {
  const app: Application = express();
  const api = buildApi(auth, machine, interpreter, workspace, usb, logger);
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
