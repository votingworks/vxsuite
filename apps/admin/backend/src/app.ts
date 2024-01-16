import { isMatch } from 'micromatch';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  Admin,
  ElectionPackageFileName,
  CastVoteRecordExportFileName,
  ContestId,
  DEFAULT_SYSTEM_SETTINGS,
  Id,
  safeParseElectionDefinition,
  SystemSettings,
  Tabulation,
  TEST_JURISDICTION,
  ElectionPackage,
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
  LiveCheck,
  prepareSignatureFile,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import path, { join } from 'path';
import {
  ELECTION_PACKAGE_FOLDER,
  generateElectionBasedSubfolderName,
  generateFilenameForElectionPackage,
  groupMapToGroupList,
  isIntegrationTest,
} from '@votingworks/utils';
import { dirSync } from 'tmp';
import ZipStream from 'zip-stream';
import {
  ElectionPackageError,
  ExportDataError,
  FileSystemEntry,
  FileSystemEntryType,
  ListDirectoryOnUsbDriveError,
  createLogsApi,
  listDirectoryOnUsbDrive,
  readElectionPackageFromFile,
} from '@votingworks/backend';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import {
  CastVoteRecordFileRecord,
  CvrFileImportInfo,
  CvrFileMode,
  ElectionRecord,
  ExportDataResult,
  ImportCastVoteRecordsError,
  ManualResultsIdentifier,
  ManualResultsMetadataRecord,
  ManualResultsRecord,
  ScannerBatch,
  WriteInAdjudicationAction,
  WriteInAdjudicationQueueMetadata,
  WriteInAdjudicationStatus,
  WriteInCandidateRecord,
  WriteInAdjudicationContext,
  WriteInImageView,
} from './types';
import { Workspace } from './util/workspace';
import { getMachineConfig } from './machine_config';
import {
  getWriteInAdjudicationContext,
  getWriteInImageView,
} from './util/write_ins';
import { handleEnteredWriteInCandidateData } from './util/manual_results';
import { addFileToZipStream } from './util/zip';
import { exportFile } from './util/export_file';
import { generateTallyReportCsv } from './exports/csv_tally_report';
import { tabulateFullCardCounts } from './tabulation/card_counts';
import { getOverallElectionWriteInSummary } from './tabulation/write_ins';
import { rootDebug } from './util/debug';
import { tabulateTallyReportResults } from './tabulation/tally_reports';
import { buildExporter } from './util/exporter';
import {
  importCastVoteRecords,
  listCastVoteRecordExportsOnUsbDrive,
} from './cast_vote_records';
import { generateBallotCountReportCsv } from './exports/csv_ballot_count_report';
import { adjudicateWriteIn } from './adjudication';
import { convertFrontendFilter as convertFrontendFilterUtil } from './util/filters';
import { buildElectionResultsReport } from './util/cdf_results';
import { tabulateElectionResults } from './tabulation/full_results';
import { NODE_ENV, REAL_USB_DRIVE_GLOB_PATTERN } from './globals';
import { TallyCache } from './tabulation/tally_cache';

const debug = rootDebug.extend('app');

function getCurrentElectionRecord(
  workspace: Workspace
): Optional<ElectionRecord> {
  const electionId = workspace.store.getCurrentElectionId();
  if (!electionId) {
    return undefined;
  }
  const electionRecord = workspace.store.getElection(electionId);
  assert(electionRecord);
  return electionRecord;
}

function constructAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  const electionRecord = getCurrentElectionRecord(workspace);
  /* c8 ignore next 3 - covered by integration testing */
  const jurisdiction = isIntegrationTest()
    ? TEST_JURISDICTION
    : process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION;

  if (!electionRecord) {
    return {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      jurisdiction,
    };
  }

  const systemSettings = workspace.store.getSystemSettings(electionRecord.id);
  return {
    ...systemSettings.auth,
    electionHash: electionRecord.electionDefinition.electionHash,
    jurisdiction,
  };
}

function loadCurrentElectionIdOrThrow(workspace: Workspace) {
  return assertDefined(workspace.store.getCurrentElectionId());
}

function buildApi({
  auth,
  workspace,
  logger,
  usbDrive,
  tallyCache,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
  tallyCache: TallyCache;
}) {
  const { store } = workspace;

  async function getUserRole() {
    const authStatus = await auth.getAuthStatus(
      constructAuthMachineState(workspace)
    );
    if (authStatus.status === 'logged_in') {
      return authStatus.user.role;
    }
    /* c8 ignore next 2 - trivial fallback case */
    return undefined;
  }

  function convertFrontendFilter(
    filter?: Admin.FrontendReportingFilter
  ): Optional<Admin.ReportingFilter> {
    if (!filter) return undefined;

    const electionId = loadCurrentElectionIdOrThrow(workspace);
    const {
      electionDefinition: { election },
    } = assertDefined(store.getElection(electionId));
    return convertFrontendFilterUtil(filter, election);
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
      const electionRecord = getCurrentElectionRecord(workspace);
      return new LiveCheck().generateQrCodeValue({
        machineId,
        electionHash: electionRecord?.electionDefinition?.electionHash,
      });
    },
    /* c8 ignore stop */

    async getUsbDriveStatus(): Promise<UsbDriveStatus> {
      return usbDrive.status();
    },

    async ejectUsbDrive(): Promise<void> {
      return usbDrive.eject(assertDefined(await getUserRole()));
    },

    async formatUsbDrive(): Promise<Result<void, Error>> {
      try {
        await usbDrive.format(assertDefined(await getUserRole()));
        return ok();
      } catch (error) {
        return err(error as Error);
      }
    },

    async saveElectionPackageToUsb(): Promise<Result<void, ExportDataError>> {
      await logger.log(LogEventId.SaveElectionPackageInit, 'election_manager');
      const exporter = buildExporter(usbDrive);

      const electionRecord = getCurrentElectionRecord(workspace);
      assert(electionRecord);
      const { electionDefinition, id: electionId } = electionRecord;
      const { election, electionHash } = electionDefinition;
      const systemSettings = store.getSystemSettings(electionId);

      const tempDirectory = dirSync().name;
      try {
        const electionPackageFileName = generateFilenameForElectionPackage(
          new Date()
        );
        const tempDirectoryElectionPackageFilePath = join(
          tempDirectory,
          electionPackageFileName
        );

        const electionPackageZipStream = new ZipStream();
        const electionPackageZipPromise = deferred<void>();
        electionPackageZipStream.on('error', electionPackageZipPromise.reject);
        electionPackageZipStream.on('end', electionPackageZipPromise.resolve);
        electionPackageZipStream.pipe(
          createWriteStream(tempDirectoryElectionPackageFilePath)
        );
        await addFileToZipStream(electionPackageZipStream, {
          path: ElectionPackageFileName.ELECTION,
          contents: electionDefinition.electionData,
        });
        await addFileToZipStream(electionPackageZipStream, {
          path: ElectionPackageFileName.SYSTEM_SETTINGS,
          contents: JSON.stringify(systemSettings, null, 2),
        });

        // TODO(kofi): Include translation/audio files in the package export.

        electionPackageZipStream.finish();
        await electionPackageZipPromise.promise;

        const usbDriveElectionPackageDirectoryRelativePath = join(
          generateElectionBasedSubfolderName(election, electionHash),
          ELECTION_PACKAGE_FOLDER
        );
        const exportElectionPackageResult = await exporter.exportDataToUsbDrive(
          usbDriveElectionPackageDirectoryRelativePath,
          electionPackageFileName,
          createReadStream(tempDirectoryElectionPackageFilePath)
        );
        if (exportElectionPackageResult.isErr()) {
          return exportElectionPackageResult;
        }

        const signatureFile = await prepareSignatureFile({
          type: 'election_package',
          // For protection against compromised/faulty USBs, we sign data as it exists on the
          // machine, not the USB, as a compromised/faulty USB could claim to have written the data
          // that we asked it to but actually have written something else.
          filePath: tempDirectoryElectionPackageFilePath,
        });
        const exportSignatureFileResult = await exporter.exportDataToUsbDrive(
          usbDriveElectionPackageDirectoryRelativePath,
          signatureFile.fileName,
          signatureFile.fileContents
        );
        /* c8 ignore start: Tricky to make this second export err but the first export succeed
          without significant mocking */
        if (exportSignatureFileResult.isErr()) {
          return exportSignatureFileResult;
        }
        /* c8 ignore stop */
      } finally {
        await fs.rm(tempDirectory, { recursive: true });
      }

      await logger.log(
        LogEventId.SaveElectionPackageComplete,
        'election_manager',
        {
          disposition: 'success',
          message: 'Successfully saved election package.',
        }
      );
      return ok();
    },

    getSystemSettings(): SystemSettings {
      const electionId = store.getCurrentElectionId();
      if (!electionId) {
        return DEFAULT_SYSTEM_SETTINGS;
      }

      return store.getSystemSettings(electionId);
    },

    async listPotentialElectionPackagesOnUsbDrive(): Promise<
      Result<FileSystemEntry[], ListDirectoryOnUsbDriveError>
    > {
      const usbDriveEntriesResult = await listDirectoryOnUsbDrive(usbDrive, '');
      if (usbDriveEntriesResult.isErr()) {
        return usbDriveEntriesResult;
      }

      return ok(
        usbDriveEntriesResult
          .ok()
          .filter(
            (entry) =>
              entry.type === FileSystemEntryType.File &&
              entry.name.endsWith('.zip') &&
              !entry.name.startsWith('.') &&
              !entry.name.startsWith('_')
          )
          // Most recent first
          .sort((a, b) => b.ctime.getTime() - a.ctime.getTime())
      );
    },

    // `configure` and `unconfigure` handle changes to the election definition
    async configure(input: {
      electionFilePath: string;
    }): Promise<Result<{ electionId: Id }, ElectionPackageError>> {
      // A check for defense-in-depth
      assert(
        NODE_ENV === 'production' && !isIntegrationTest()
          ? isMatch(input.electionFilePath, REAL_USB_DRIVE_GLOB_PATTERN)
          : true,
        'Can only import election packages from removable media in production'
      );

      let electionPackage: ElectionPackage;
      if (input.electionFilePath.endsWith('.json')) {
        const electionDefinitionResult = safeParseElectionDefinition(
          await fs.readFile(input.electionFilePath, 'utf8')
        );
        if (electionDefinitionResult.isErr()) {
          return err({
            type: 'invalid-election',
            message: electionDefinitionResult.err().toString(),
          });
        }
        electionPackage = {
          electionDefinition: electionDefinitionResult.ok(),
          systemSettings: DEFAULT_SYSTEM_SETTINGS,
        };
      } else {
        const electionPackageResult = await readElectionPackageFromFile(
          input.electionFilePath
        );
        if (electionPackageResult.isErr()) {
          return electionPackageResult;
        }
        electionPackage = electionPackageResult.ok();
      }

      const { electionDefinition, systemSettings } = electionPackage;
      const electionId = store.addElection({
        electionData: electionDefinition.electionData,
        systemSettingsData: JSON.stringify(systemSettings),
      });
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

    async listCastVoteRecordFilesOnUsb() {
      const userRole = assertDefined(await getUserRole());
      const electionRecord = assertDefined(getCurrentElectionRecord(workspace));
      const { electionDefinition } = electionRecord;

      const listResult = await listCastVoteRecordExportsOnUsbDrive(
        usbDrive,
        electionDefinition
      );
      if (listResult.isErr()) {
        await logger.log(
          LogEventId.ListCastVoteRecordExportsOnUsbDrive,
          userRole,
          {
            disposition: 'failure',
            message: 'Error listing cast vote record exports on USB drive.',
            reason: listResult.err(),
          }
        );
        return [];
      }
      const castVoteRecordExportSummaries = listResult.ok();
      await logger.log(
        LogEventId.ListCastVoteRecordExportsOnUsbDrive,
        userRole,
        {
          disposition: 'success',
          message: `Found ${castVoteRecordExportSummaries.length} cast vote record export(s) on USB drive.`,
        }
      );
      return castVoteRecordExportSummaries;
    },

    getCastVoteRecordFiles(): CastVoteRecordFileRecord[] {
      return store.getCvrFiles(loadCurrentElectionIdOrThrow(workspace));
    },

    async addCastVoteRecordFile(input: {
      path: string;
    }): Promise<Result<CvrFileImportInfo, ImportCastVoteRecordsError>> {
      const userRole = assertDefined(await getUserRole());
      await logger.log(LogEventId.ImportCastVoteRecordsInit, userRole, {
        message: 'Importing cast vote records...',
      });
      const exportDirectoryPath =
        // For manual export selection, users must select the contained metadata file as a proxy
        // for the export directory since the UI doesn't support directory selection
        path.basename(input.path) === CastVoteRecordExportFileName.METADATA
          ? path.dirname(input.path)
          : input.path;
      const importResult = await importCastVoteRecords(
        store,
        exportDirectoryPath
      );
      if (importResult.isErr()) {
        await logger.log(LogEventId.ImportCastVoteRecordsComplete, userRole, {
          disposition: 'failure',
          message: 'Error importing cast vote records.',
          exportDirectoryPath,
          errorDetails: JSON.stringify(importResult.err()),
        });
      } else {
        tallyCache.clear();
        const { alreadyPresent: numAlreadyPresent, newlyAdded: numNewlyAdded } =
          importResult.ok();
        let message = `Successfully imported ${numNewlyAdded} cast vote record(s).`;
        if (numAlreadyPresent > 0) {
          message += ` Ignored ${numAlreadyPresent} duplicate(s).`;
        }
        await logger.log(LogEventId.ImportCastVoteRecordsComplete, userRole, {
          disposition: 'success',
          message,
          exportDirectoryPath,
        });
      }
      return importResult;
    },

    async clearCastVoteRecordFiles(): Promise<void> {
      const userRole = assertDefined(await getUserRole());
      await logger.log(LogEventId.ClearImportedCastVoteRecordsInit, userRole, {
        message: 'Clearing imported cast vote records...',
      });
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      store.deleteCastVoteRecordFiles(electionId);
      store.setElectionResultsOfficial(electionId, false);
      tallyCache.clear();
      await logger.log(
        LogEventId.ClearImportedCastVoteRecordsComplete,
        userRole,
        {
          disposition: 'success',
          message: 'Successfully cleared all imported cast vote records.',
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

    async adjudicateWriteIn(input: WriteInAdjudicationAction): Promise<void> {
      await adjudicateWriteIn(input, store, logger);
      tallyCache.clear();
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
          precinctIds: [input.precinctId],
          ballotStyleIds: [input.ballotStyleId],
          votingMethods: [input.votingMethod],
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
        filter?: Admin.FrontendReportingFilter;
      } = {}
    ): Array<Tabulation.GroupOf<Tabulation.CardCounts>> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      return groupMapToGroupList(
        tabulateFullCardCounts({
          electionId,
          store,
          groupBy: input.groupBy,
          filter: convertFrontendFilter(input.filter),
        })
      );
    },

    async getResultsForTallyReports(
      input: {
        filter?: Admin.FrontendReportingFilter;
        groupBy?: Tabulation.GroupBy;
      } = {}
    ): Promise<Tabulation.GroupList<Admin.TallyReportResults>> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      return tabulateTallyReportResults({
        electionId,
        store,
        filter: convertFrontendFilter(input.filter),
        groupBy: input.groupBy,
        tallyCache,
      });
    },

    getScannerBatches(): ScannerBatch[] {
      return store.getScannerBatches(loadCurrentElectionIdOrThrow(workspace));
    },

    async exportTallyReportCsv(input: {
      path: string;
      filter?: Admin.FrontendReportingFilter;
      groupBy?: Tabulation.GroupBy;
    }): Promise<ExportDataResult> {
      debug('exporting tally report CSV file: %o', input);
      const exportFileResult = await exportFile({
        path: input.path,
        data: generateTallyReportCsv({
          store,
          filter: convertFrontendFilter(input.filter),
          groupBy: input.groupBy,
          tallyCache,
        }),
      });

      await logger.log(
        LogEventId.FileSaved,
        assertDefined(await getUserRole()),
        {
          disposition: exportFileResult.isOk() ? 'success' : 'failure',
          message: `${
            exportFileResult.isOk() ? 'Saved' : 'Failed to save'
          } tally report CSV file to ${input.path} on the USB drive.`,
          filename: input.path,
        }
      );

      return exportFileResult;
    },

    async exportBallotCountReportCsv(input: {
      path: string;
      filter?: Admin.FrontendReportingFilter;
      groupBy?: Tabulation.GroupBy;
      includeSheetCounts?: boolean;
    }): Promise<ExportDataResult> {
      debug('exporting ballot count report CSV file: %o', input);
      const exportFileResult = await exportFile({
        path: input.path,
        data: generateBallotCountReportCsv({
          store,
          filter: convertFrontendFilter(input.filter),
          groupBy: input.groupBy,
          includeSheetCounts: input.includeSheetCounts,
        }),
      });

      await logger.log(
        LogEventId.FileSaved,
        assertDefined(await getUserRole()),
        {
          disposition: exportFileResult.isOk() ? 'success' : 'failure',
          message: `${
            exportFileResult.isOk() ? 'Saved' : 'Failed to save'
          } ballot count report CSV file to ${input.path} on the USB drive.`,
          filename: input.path,
        }
      );

      return exportFileResult;
    },

    async exportCdfElectionResultsReport(input: {
      path: string;
    }): Promise<ExportDataResult> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      const electionRecord = store.getElection(electionId);
      assert(electionRecord);
      const {
        isOfficialResults,
        electionDefinition: { election },
      } = electionRecord;

      const isTestMode =
        store.getCurrentCvrFileModeForElection(electionId) === 'test';
      const writeInCandidates = store.getWriteInCandidates({ electionId });

      const electionResults = groupMapToGroupList(
        await tabulateElectionResults({
          electionId,
          store,
          includeWriteInAdjudicationResults: true,
          includeManualResults: true,
          tallyCache,
        })
      )[0];
      assert(electionResults);

      debug('exporting CDF election results report JSON file: %o', input);
      const exportFileResult = await exportFile({
        path: input.path,
        data: JSON.stringify(
          buildElectionResultsReport({
            election,
            electionResults,
            isOfficialResults,
            isTestMode,
            writeInCandidates,
            machineConfig: getMachineConfig(),
          })
        ),
      });

      await logger.log(
        LogEventId.FileSaved,
        assertDefined(await getUserRole()),
        {
          disposition: exportFileResult.isOk() ? 'success' : 'failure',
          message: `${
            exportFileResult.isOk() ? 'Saved' : 'Failed to save'
          } CDF election results report JSON file to ${
            input.path
          } on the USB drive.`,
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

    ...createLogsApi({ usbDrive, machineId: getMachineConfig().machineId }),
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
  workspace,
  logger,
  usbDrive,
  tallyCache,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
  tallyCache: TallyCache;
}): Application {
  const app: Application = express();
  const api = buildApi({ auth, workspace, logger, usbDrive, tallyCache });
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express);
  return app;
}
