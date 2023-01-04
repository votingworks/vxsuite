import { Scan } from '@votingworks/api';
import { pdfToImages } from '@votingworks/image-utils';
import * as grout from '@votingworks/grout';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BallotPageLayoutWithImage,
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
  find,
  generateFilenameForScanningResults,
  readBallotPackageFromBuffer,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import express, { Application } from 'express';
import * as fs from 'fs/promises';
import { pipeline } from 'stream/promises';
import { UsbDrive } from '@votingworks/data';
import path from 'path';
import { existsSync } from 'fs';
import { backupToUsbDrive } from './backup';
import { exportCastVoteRecordsAsNdJson } from './cvrs/export';
import { PrecinctScannerInterpreter } from './interpret';
import { PrecinctScannerStateMachine } from './state_machine';
import { rootDebug } from './util/debug';
import { Workspace } from './util/workspace';

const debug = rootDebug.extend('app');

type NoParams = never;

/**
 * An interface for interacting with USB drives. We inject this into the app so
 * that we can easily mock it in tests.
 */
export interface Usb {
  getUsbDrives: () => Promise<UsbDrive[]>;
}

/**
 * Possible errors that can occur during configuration (currently there's only one).
 */
export type ConfigurationError = 'no_ballot_package_on_usb_drive';

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

      const ballotTemplatesWithImages = await Promise.all(
        ballotPackage.ballots.map(async (ballotTemplate) => {
          const layoutsWithImages: BallotPageLayoutWithImage[] = [];
          for await (const { page, pageNumber } of pdfToImages(
            ballotTemplate.pdf,
            {
              scale: 2,
            }
          )) {
            const ballotPageLayout = find(
              ballotTemplate.layout,
              (l) => l.metadata.pageNumber === pageNumber
            );
            layoutsWithImages.push({ ballotPageLayout, imageData: page });
          }
          return { ...ballotTemplate, layoutsWithImages };
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-shadow
      store.withTransaction((store) => {
        const { electionDefinition } = ballotPackage;
        store.setElection(electionDefinition.electionData);

        // If the election has only one precinct, set it automatically
        if (electionDefinition.election.precincts.length === 1) {
          store.setPrecinctSelection(
            singlePrecinctSelectionFor(
              electionDefinition.election.precincts[0].id
            )
          );
        }

        for (const ballotTemplate of ballotTemplatesWithImages) {
          store.addHmpbTemplate(
            ballotTemplate.pdf,
            ballotTemplate.layoutsWithImages[0].ballotPageLayout.metadata,
            ballotTemplate.layoutsWithImages
          );
        }
      });

      return ok();
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async getConfig(): Promise<Scan.PrecinctScannerConfig> {
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

    // eslint-disable-next-line @typescript-eslint/require-await
    async unconfigureElection(input: {
      ignoreBackupRequirement?: boolean;
    }): Promise<void> {
      assert(
        input.ignoreBackupRequirement || store.getCanUnconfigure(),
        'Attempt to unconfigure without backup'
      );
      interpreter.unconfigure();
      workspace.reset();
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async setPrecinctSelection(input: {
      precinctSelection: PrecinctSelection;
    }): Promise<void> {
      assert(
        store.getBallotsCounted() === 0,
        'Attempt to change precinct selection after ballots have been cast'
      );
      store.setPrecinctSelection(input.precinctSelection);
      workspace.resetElectionSession();
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async setMarkThresholdOverrides(input: {
      markThresholdOverrides?: MarkThresholds;
    }): Promise<void> {
      store.setMarkThresholdOverrides(input.markThresholdOverrides);
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async setIsSoundMuted(input: { isSoundMuted: boolean }): Promise<void> {
      store.setIsSoundMuted(input.isSoundMuted);
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async setTestMode(input: { isTestMode: boolean }): Promise<void> {
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

    async backupToUsbDrive(): Promise<Result<void, Scan.BackupError>> {
      const result = await backupToUsbDrive(store);
      return result.isErr() ? result : ok();
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async getScannerStatus(): Promise<Scan.PrecinctScannerStatus> {
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

    // eslint-disable-next-line @typescript-eslint/require-await
    async acceptBallot(): Promise<void> {
      machine.accept();
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async returnBallot(): Promise<void> {
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
  const { store } = workspace;

  const app: Application = express();

  const api = buildApi(machine, interpreter, workspace, usb, logger);
  app.use('/api', grout.buildRouter(api, express));

  const deprecatedApiRouter = express.Router();

  deprecatedApiRouter.use(express.raw());
  deprecatedApiRouter.use(
    express.json({ limit: '5mb', type: 'application/json' })
  );
  deprecatedApiRouter.use(express.urlencoded({ extended: false }));

  deprecatedApiRouter.post<NoParams, Scan.ExportResponse, Scan.ExportRequest>(
    '/precinct-scanner/export',
    async (request, response) => {
      const skipImages = request.body?.skipImages;
      debug(`exporting CVRs ${skipImages ? 'without' : 'with'} inline images`);

      const cvrFilename = generateFilenameForScanningResults(
        // TODO: Move machine config provider to shared utilities and access
        // actual machine config, with dev overrides, here instead
        'NO-ID',
        store.getBallotsCounted(),
        store.getTestMode(),
        new Date()
      );

      response
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${cvrFilename}"`);

      await pipeline(
        exportCastVoteRecordsAsNdJson({ store, skipImages }),
        response
      );

      store.setCvrsBackedUp();
    }
  );

  app.use(deprecatedApiRouter);

  return app;
}
