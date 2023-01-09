import * as grout from '@votingworks/grout';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  CastVoteRecord,
  err,
  MarkThresholds,
  ok,
  PollsState,
  PrecinctSelection,
  Result,
} from '@votingworks/types';
import {
  assert,
  BALLOT_PACKAGE_FOLDER,
  readBallotPackageFromBuffer,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import express, { Application } from 'express';
import * as fs from 'fs/promises';
import { ExportDataError } from '@votingworks/data';
import path from 'path';
import { existsSync } from 'fs';
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

function buildApi(
  machine: PrecinctScannerStateMachine,
  interpreter: PrecinctScannerInterpreter,
  workspace: Workspace,
  usb: Usb,
  logger: Logger
) {
  const { store } = workspace;

  return grout.createApi({
    async configureFromBallotPackageOnUsbDrive(): Promise<
      Result<void, ConfigurationError>
    > {
      assert(!store.getElectionDefinition());
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

      await store.withTransaction(async () => {
        const { electionDefinition, ballots } = ballotPackage;
        store.setElection(electionDefinition.electionData);

        // If the election has only one precinct, set it automatically
        if (electionDefinition.election.precincts.length === 1) {
          store.setPrecinctSelection(
            singlePrecinctSelectionFor(
              electionDefinition.election.precincts[0].id
            )
          );
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

    async exportCastVoteRecordsToUsbDrive(input: {
      machineId: string;
    }): Promise<Result<void, ExportDataError>> {
      return await exportCastVoteRecordsToUsbDrive(store, usb, input.machineId);
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

    async calibrate(): Promise<boolean> {
      const result = await machine.calibrate();
      return result.isOk();
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(
  machine: PrecinctScannerStateMachine,
  interpreter: PrecinctScannerInterpreter,
  workspace: Workspace,
  usb: Usb,
  logger: Logger
): Application {
  const app: Application = express();
  const api = buildApi(machine, interpreter, workspace, usb, logger);
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
