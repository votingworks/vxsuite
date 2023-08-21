import { LogEventId, Logger } from '@votingworks/logging';
import {
  BallotPackageExportResult,
  ContestId,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  Id,
  safeParseElectionDefinition,
  safeParseJson,
  SystemSettings,
  SystemSettingsSchema,
  Tabulation,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  assert,
  assertDefined,
  deferred,
  err,
  ok,
  Optional,
  Result,
} from '@votingworks/basics';
import express, { Application } from 'express';
import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
  DEV_JURISDICTION,
  ArtifactAuthenticatorApi,
  LiveCheck,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  promises as fs,
  Stats,
} from 'fs';
import { basename, dirname, join } from 'path';
import {
  BALLOT_PACKAGE_FOLDER,
  CAST_VOTE_RECORD_REPORT_FILENAME,
  generateFilenameForBallotExportPackage,
  groupMapToGroupList,
  isIntegrationTest,
  parseCastVoteRecordReportDirectoryName,
} from '@votingworks/utils';
import { dirSync } from 'tmp';
import ZipStream from 'zip-stream';
import {
  CastVoteRecordFileRecord,
  ConfigureResult,
  CvrFileImportInfo,
  CvrFileMode,
  ElectionRecord,
  ExportDataResult,
  ManualResultsIdentifier,
  ManualResultsMetadataRecord,
  ManualResultsRecord,
  ScannerBatch,
  SemsExportableTallies,
  SetSystemSettingsResult,
  TallyReportResults,
  WriteInAdjudicationAction,
  WriteInAdjudicationQueueMetadata,
  WriteInAdjudicationStatus,
  WriteInCandidateRecord,
  WriteInAdjudicationContext,
  WriteInImageView,
} from './types';
import { Workspace } from './util/workspace';
import {
  AddCastVoteRecordReportError,
  addCastVoteRecordReport,
  getAddCastVoteRecordReportErrorMessage,
  listCastVoteRecordFilesOnUsb,
} from './cvr_files';
import { Usb } from './util/usb';
import { getMachineConfig } from './machine_config';
import {
  getWriteInAdjudicationContext,
  getWriteInImageView,
} from './util/write_ins';
import { handleEnteredWriteInCandidateData } from './util/manual_results';
import { addFileToZipStream } from './util/zip';
import { exportFile } from './util/export_file';
import { generateBatchResultsFile } from './exports/batch_results';
import {
  tabulateElectionResults,
  tabulateTallyReportResults,
} from './tabulation/full_results';
import { getSemsExportableTallies } from './exports/sems_tallies';
import { generateResultsCsv } from './exports/csv_results';
import { tabulateFullCardCounts } from './tabulation/card_counts';
import { getOverallElectionWriteInSummary } from './tabulation/write_ins';
import { rootDebug } from './util/debug';

const debug = rootDebug.extend('app');

function getCurrentElectionDefinition(
  workspace: Workspace
): Optional<ElectionDefinition> {
  const currentElectionId = workspace.store.getCurrentElectionId();
  const elections = workspace.store.getElections();
  const mostRecentlyCreatedElection = elections.find(
    (election) => election.id === currentElectionId
  );
  return mostRecentlyCreatedElection?.electionDefinition;
}

function constructAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  const electionDefinition = getCurrentElectionDefinition(workspace);
  const systemSettings = workspace.store.getSystemSettings();
  return {
    ...(systemSettings ?? {}),
    electionHash: electionDefinition?.electionHash,
    jurisdiction: isIntegrationTest()
      ? TEST_JURISDICTION
      : process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION,
  };
}

function loadCurrentElectionIdOrThrow(workspace: Workspace) {
  return assertDefined(workspace.store.getCurrentElectionId());
}

function buildApi({
  auth,
  artifactAuthenticator,
  workspace,
  logger,
  usb,
}: {
  auth: DippedSmartCardAuthApi;
  artifactAuthenticator: ArtifactAuthenticatorApi;
  workspace: Workspace;
  logger: Logger;
  usb: Usb;
}) {
  const { store } = workspace;

  async function getUserRole() {
    const authStatus = await auth.getAuthStatus(
      constructAuthMachineState(workspace)
    );
    if (authStatus.status === 'logged_in') {
      return authStatus.user.role;
    }
    return undefined;
  }

  return grout.createApi({
    getMachineConfig,

    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(workspace));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(workspace), input);
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(workspace));
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(
        constructAuthMachineState(workspace),
        input
      );
    },

    programCard(input: {
      userRole: 'system_administrator' | 'election_manager' | 'poll_worker';
    }) {
      return auth.programCard(constructAuthMachineState(workspace), {
        userRole: input.userRole,
      });
    },

    unprogramCard() {
      return auth.unprogramCard(constructAuthMachineState(workspace));
    },

    /* c8 ignore start */
    generateLiveCheckQrCodeValue() {
      const { machineId } = getMachineConfig();
      const electionDefinition = getCurrentElectionDefinition(workspace);
      return new LiveCheck().generateQrCodeValue({
        machineId,
        electionHash: electionDefinition?.electionHash,
      });
    },
    /* c8 ignore stop */

    async saveBallotPackageToUsb(): Promise<BallotPackageExportResult> {
      await logger.log(LogEventId.SaveBallotPackageInit, 'election_manager');

      const electionDefinition = getCurrentElectionDefinition(workspace);
      assert(electionDefinition !== undefined);
      const systemSettings =
        store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;

      const tempDirectory = dirSync().name;
      try {
        const ballotPackageFileName = generateFilenameForBallotExportPackage(
          electionDefinition,
          new Date()
        );
        const tempDirectoryBallotPackageFilePath = join(
          tempDirectory,
          ballotPackageFileName
        );

        const ballotPackageZipStream = new ZipStream();
        const ballotPackageZipPromise = deferred<void>();
        ballotPackageZipStream.on('error', ballotPackageZipPromise.reject);
        ballotPackageZipStream.on('end', ballotPackageZipPromise.resolve);
        ballotPackageZipStream.pipe(
          createWriteStream(tempDirectoryBallotPackageFilePath)
        );
        await addFileToZipStream(ballotPackageZipStream, {
          path: 'election.json',
          contents: electionDefinition.electionData,
        });
        await addFileToZipStream(ballotPackageZipStream, {
          path: 'systemSettings.json',
          contents: JSON.stringify(systemSettings, null, 2),
        });
        ballotPackageZipStream.finish();
        await ballotPackageZipPromise.promise;

        const usbMountPoint = (await usb.getUsbDrives())[0]?.mountPoint;
        if (!usbMountPoint) {
          await logger.log(
            LogEventId.SaveBallotPackageComplete,
            'election_manager',
            {
              disposition: 'failure',
              message: 'Error saving ballot package: no USB drive',
              result: 'Ballot package not saved, error shown to user.',
            }
          );
          return err('no_usb_drive');
        }
        const usbBallotPackageDirectory = join(
          usbMountPoint,
          BALLOT_PACKAGE_FOLDER
        );
        if (!existsSync(usbBallotPackageDirectory)) {
          await fs.mkdir(usbBallotPackageDirectory);
        }

        const usbBallotPackageFilePath = join(
          usbBallotPackageDirectory,
          ballotPackageFileName
        );
        await fs.writeFile(
          usbBallotPackageFilePath,
          createReadStream(tempDirectoryBallotPackageFilePath)
        );

        await artifactAuthenticator.writeSignatureFile(
          {
            type: 'ballot_package',
            // For protection against compromised/faulty USBs, we sign the ballot package as it
            // exists on the machine, not on the USB (as a compromised/faulty USB could claim to
            // have written the data that we asked it to but actually have written something else)
            path: tempDirectoryBallotPackageFilePath,
          },
          usbBallotPackageDirectory
        );
      } finally {
        await fs.rm(tempDirectory, { recursive: true });
      }

      await logger.log(
        LogEventId.SaveBallotPackageComplete,
        'election_manager',
        {
          disposition: 'success',
          message: 'Successfully saved ballot package.',
        }
      );
      return ok();
    },

    async setSystemSettings(input: {
      systemSettings: string;
    }): Promise<SetSystemSettingsResult> {
      await logger.log(
        LogEventId.SystemSettingsSaveInitiated,
        assertDefined(await getUserRole()),
        { disposition: 'na' }
      );

      const { systemSettings } = input;
      const validatedSystemSettings = safeParseJson(
        systemSettings,
        SystemSettingsSchema
      );
      if (validatedSystemSettings.isErr()) {
        return err({
          type: 'parsing',
          message: validatedSystemSettings.err()?.message,
        });
      }

      try {
        store.saveSystemSettings(validatedSystemSettings.ok());
      } catch (error) {
        const typedError = error as Error;
        await logger.log(
          LogEventId.SystemSettingsSaved,
          assertDefined(await getUserRole()),
          { disposition: 'failure', error: typedError.message }
        );
        throw error;
      }

      await logger.log(
        LogEventId.SystemSettingsSaved,
        assertDefined(await getUserRole()),
        { disposition: 'success' }
      );

      return ok({});
    },

    async getSystemSettings(): Promise<SystemSettings> {
      try {
        const settings = store.getSystemSettings();
        await logger.log(
          LogEventId.SystemSettingsRetrieved,
          (await getUserRole()) ?? 'unknown',
          { disposition: 'success' }
        );
        return settings ?? DEFAULT_SYSTEM_SETTINGS;
      } catch (error) {
        await logger.log(
          LogEventId.SystemSettingsRetrieved,
          (await getUserRole()) ?? 'unknown',
          { disposition: 'failure' }
        );
        throw error;
      }
    },

    // `configure` and `unconfigure` handle changes to the election definition
    async configure(input: { electionData: string }): Promise<ConfigureResult> {
      const parseResult = safeParseElectionDefinition(input.electionData);
      if (parseResult.isErr()) {
        return err({ type: 'parsing', message: parseResult.err().message });
      }
      const electionDefinition = parseResult.ok();
      const electionId = store.addElection(electionDefinition.electionData);
      store.setCurrentElectionId(electionId);
      await logger.log(
        LogEventId.ElectionConfigured,
        assertDefined(await getUserRole()),
        {
          disposition: 'success',
          newElectionHash: electionDefinition.electionHash,
        }
      );
      return ok({ electionId });
    },

    async unconfigure(): Promise<void> {
      store.deleteElection(loadCurrentElectionIdOrThrow(workspace));
      store.setCurrentElectionId();
      await logger.log(
        LogEventId.ElectionUnconfigured,
        assertDefined(await getUserRole()),
        {
          disposition: 'success',
        }
      );
    },

    // use null because React Query does not allow undefined as a query result
    getCurrentElectionMetadata(): ElectionRecord | null {
      const currentElectionId = store.getCurrentElectionId();
      if (currentElectionId) {
        const electionRecord = store.getElection(currentElectionId);
        assert(electionRecord);
        return electionRecord;
      }

      return null;
    },

    async markResultsOfficial(): Promise<void> {
      store.setElectionResultsOfficial(
        loadCurrentElectionIdOrThrow(workspace),
        true
      );

      await logger.log(
        LogEventId.MarkedTallyResultsOfficial,
        assertDefined(await getUserRole()),
        {
          message:
            'User has marked the tally results as official, no more cast vote record files can be loaded.',
          disposition: 'success',
        }
      );
    },

    listCastVoteRecordFilesOnUsb() {
      const electionDefinition = getCurrentElectionDefinition(workspace);
      assert(electionDefinition);

      return listCastVoteRecordFilesOnUsb(electionDefinition, usb, logger);
    },

    getCastVoteRecordFiles(): CastVoteRecordFileRecord[] {
      return store.getCvrFiles(loadCurrentElectionIdOrThrow(workspace));
    },

    async addCastVoteRecordFile(input: {
      path: string;
    }): Promise<
      Result<
        CvrFileImportInfo,
        AddCastVoteRecordReportError & { message: string }
      >
    > {
      const userRole = assertDefined(await getUserRole());
      const { path: inputPath } = input;
      // the path passed to the backend may be for the report directory or the
      // contained .json report, so we resolve to the report directory path
      const path =
        basename(inputPath) === CAST_VOTE_RECORD_REPORT_FILENAME
          ? dirname(inputPath)
          : inputPath;

      const filename = basename(path);
      let fileStat: Stats;
      try {
        fileStat = await fs.stat(path);
      } catch (error) {
        const message = getAddCastVoteRecordReportErrorMessage({
          type: 'report-access-failure',
        });
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message,
          disposition: 'failure',
          filename,
          error: message,
          result: 'Report not loaded, error shown to user.',
        });
        return err({
          type: 'report-access-failure',
          message,
        });
      }

      // try to get the exported timestamp from the filename, otherwise use file last modified
      const exportedTimestamp =
        parseCastVoteRecordReportDirectoryName(basename(path))?.timestamp ||
        fileStat.mtime;

      const addCastVoteRecordReportResult = await addCastVoteRecordReport({
        store,
        reportDirectoryPath: path,
        exportedTimestamp: exportedTimestamp.toISOString(),
        artifactAuthenticator,
      });

      if (addCastVoteRecordReportResult.isErr()) {
        const message = getAddCastVoteRecordReportErrorMessage(
          addCastVoteRecordReportResult.err()
        );
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message,
          disposition: 'failure',
          filename,
          result: 'Report not loaded, error shown to user.',
        });
        return err({
          ...addCastVoteRecordReportResult.err(),
          message,
        });
      }

      if (addCastVoteRecordReportResult.ok().wasExistingFile) {
        // log failure if the file was a duplicate
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message:
            'Cast vote record report was not loaded as it is a duplicate of a previously loaded file.',
          disposition: 'failure',
          filename,
          result: 'Report not loaded, error shown to user.',
        });
      } else {
        // log success otherwise
        await logger.log(LogEventId.CvrLoaded, userRole, {
          message: 'Cast vote record report successfully loaded.',
          disposition: 'success',
          filename,
          numberOfBallotsImported:
            addCastVoteRecordReportResult.ok().newlyAdded,
          duplicateBallotsIgnored:
            addCastVoteRecordReportResult.ok().alreadyPresent,
        });
      }
      return addCastVoteRecordReportResult;
    },

    async clearCastVoteRecordFiles(): Promise<void> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      store.deleteCastVoteRecordFiles(electionId);
      store.setElectionResultsOfficial(electionId, false);
      await logger.log(
        LogEventId.CaseVoteRecordFileRemoved,
        assertDefined(await getUserRole()),
        {
          message: 'User removed all cast vote record files.',
          disposition: 'success',
        }
      );
    },

    getCastVoteRecordFileMode(): CvrFileMode {
      return store.getCurrentCvrFileModeForElection(
        loadCurrentElectionIdOrThrow(workspace)
      );
    },

    getWriteInAdjudicationQueue(
      input: {
        contestId?: ContestId;
      } = {}
    ): Id[] {
      return store.getWriteInAdjudicationQueue({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
    },

    getFirstPendingWriteInId(input: { contestId: ContestId }): Id | null {
      return (
        store.getFirstPendingWriteInId({
          electionId: loadCurrentElectionIdOrThrow(workspace),
          ...input,
        }) ?? null
      );
    },

    adjudicateWriteIn(input: WriteInAdjudicationAction): void {
      store.adjudicateWriteIn(input);
    },

    getWriteInAdjudicationQueueMetadata(
      input: {
        contestId?: ContestId;
        status?: WriteInAdjudicationStatus;
      } = {}
    ): WriteInAdjudicationQueueMetadata[] {
      return store.getWriteInAdjudicationQueueMetadata({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
    },

    getWriteInCandidates(
      input: {
        contestId?: ContestId;
      } = {}
    ): WriteInCandidateRecord[] {
      return store.getWriteInCandidates({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
    },

    addWriteInCandidate(input: {
      contestId: ContestId;
      name: string;
    }): WriteInCandidateRecord {
      return store.addWriteInCandidate({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
    },

    getWriteInImageView(input: {
      writeInId: string;
    }): Promise<WriteInImageView> {
      return getWriteInImageView({
        store: workspace.store,
        writeInId: input.writeInId,
      });
    },

    getWriteInAdjudicationContext(input: {
      writeInId: string;
    }): WriteInAdjudicationContext {
      return getWriteInAdjudicationContext({
        store: workspace.store,
        writeInId: input.writeInId,
      });
    },

    async deleteAllManualResults(): Promise<void> {
      store.deleteAllManualResults({
        electionId: loadCurrentElectionIdOrThrow(workspace),
      });
      await logger.log(
        LogEventId.ManualTallyDataRemoved,
        assertDefined(await getUserRole()),
        {
          message: 'User removed all manually entered tally data.',
          disposition: 'success',
        }
      );
    },

    async deleteManualResults(input: ManualResultsIdentifier): Promise<void> {
      store.deleteManualResults({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
      await logger.log(
        LogEventId.ManualTallyDataRemoved,
        assertDefined(await getUserRole()),
        {
          message:
            'User removed manually entered tally data for a particular ballot style, precinct, and voting method.',
          ...input,
          disposition: 'success',
        }
      );
    },

    async setManualResults(
      input: ManualResultsIdentifier & {
        manualResults: Tabulation.ManualElectionResults;
      }
    ): Promise<void> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      await store.withTransaction(() => {
        const manualResults = handleEnteredWriteInCandidateData({
          manualResults: input.manualResults,
          electionId,
          store,
        });
        store.setManualResults({
          electionId,
          precinctId: input.precinctId,
          ballotStyleId: input.ballotStyleId,
          votingMethod: input.votingMethod,
          manualResults,
        });
        return Promise.resolve();
      });

      await logger.log(
        LogEventId.ManualTallyDataEdited,
        assertDefined(await getUserRole()),
        {
          disposition: 'success',
          message:
            'User added or edited manually entered tally data for a particular ballot style, precinct, and voting method.',
          ballotCount: input.manualResults.ballotCount,
          ballotStyleId: input.ballotStyleId,
          precinctId: input.precinctId,
          ballotType: input.votingMethod,
        }
      );
    },

    getManualResults(
      input: ManualResultsIdentifier
    ): ManualResultsRecord | null {
      const [manualResultsRecord] = store.getManualResults({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        filter: {
          precinctIds: input.precinctId ? [input.precinctId] : undefined,
          ballotStyleIds: input.ballotStyleId
            ? [input.ballotStyleId]
            : undefined,
          votingMethods: input.votingMethod ? [input.votingMethod] : undefined,
        },
      });

      return manualResultsRecord ?? null;
    },

    getManualResultsMetadata(): ManualResultsMetadataRecord[] {
      return store.getManualResultsMetadata({
        electionId: loadCurrentElectionIdOrThrow(workspace),
      });
    },

    getCardCounts(
      input: {
        groupBy?: Tabulation.GroupBy;
        blankBallotsOnly?: boolean;
      } = {}
    ): Array<Tabulation.GroupOf<Tabulation.CardCounts>> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      return groupMapToGroupList(
        tabulateFullCardCounts({
          electionId,
          store,
          ...input,
        })
      );
    },

    async getResultsForTallyReports(
      input: {
        filter?: Tabulation.Filter;
        groupBy?: Tabulation.GroupBy;
      } = {}
    ): Promise<Tabulation.GroupList<TallyReportResults>> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      return groupMapToGroupList(
        await tabulateTallyReportResults({
          electionId,
          store,
          filter: input.filter,
          groupBy: input.groupBy,
        })
      );
    },

    getScannerBatches(): ScannerBatch[] {
      return store.getScannerBatches(loadCurrentElectionIdOrThrow(workspace));
    },

    async exportBatchResults(input: {
      path: string;
    }): Promise<ExportDataResult> {
      debug('exporting batch results CSV file');
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      const {
        electionDefinition: { election },
      } = assertDefined(store.getElection(electionId));

      const exportFileResult = await exportFile({
        path: input.path,
        data: generateBatchResultsFile({
          election,
          batchGroupedResults: await tabulateElectionResults({
            electionId,
            store,
            groupBy: { groupByBatch: true },
          }),
          allBatchMetadata: store.getScannerBatches(electionId),
        }),
      });

      await logger.log(
        LogEventId.FileSaved,
        assertDefined(await getUserRole()),
        {
          disposition: exportFileResult.isOk() ? 'success' : 'failure',
          message: `${
            exportFileResult.isOk() ? 'Saved' : 'Failed to save'
          } batch results to ${input.path} on the USB drive.`,
          filename: input.path,
        }
      );

      return exportFileResult;
    },

    async getSemsExportableTallies(): Promise<SemsExportableTallies> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);

      debug('aggregating results for SEMS exportable tallies');
      return getSemsExportableTallies(
        await tabulateElectionResults({
          electionId,
          store,
          groupBy: { groupByPrecinct: true },
          includeManualResults: true,
          includeWriteInAdjudicationResults: false,
        })
      );
    },

    async exportResultsCsv(input: {
      path: string;
      filter?: Tabulation.Filter;
      groupBy?: Tabulation.GroupBy;
    }): Promise<ExportDataResult> {
      debug('exporting results CSV file: %o', input);
      const exportFileResult = await exportFile({
        path: input.path,
        data: await generateResultsCsv({
          store,
          filter: input.filter,
          groupBy: input.groupBy,
        }),
      });

      await logger.log(
        LogEventId.FileSaved,
        assertDefined(await getUserRole()),
        {
          disposition: exportFileResult.isOk() ? 'success' : 'failure',
          message: `${
            exportFileResult.isOk() ? 'Saved' : 'Failed to save'
          } csv results to ${input.path} on the USB drive.`,
          filename: input.path,
        }
      );

      return exportFileResult;
    },

    getElectionWriteInSummary(): Tabulation.ElectionWriteInSummary {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      return getOverallElectionWriteInSummary({
        electionId,
        store,
      });
    },
  });
}

/**
 * A type to be used by the frontend to create a Grout API client
 */
export type Api = ReturnType<typeof buildApi>;

/**
 * Builds an express application.
 */
export function buildApp({
  auth,
  artifactAuthenticator,
  workspace,
  logger,
  usb,
}: {
  auth: DippedSmartCardAuthApi;
  artifactAuthenticator: ArtifactAuthenticatorApi;
  workspace: Workspace;
  logger: Logger;
  usb: Usb;
}): Application {
  const app: Application = express();
  const api = buildApi({ auth, artifactAuthenticator, workspace, logger, usb });
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express);
  return app;
}
