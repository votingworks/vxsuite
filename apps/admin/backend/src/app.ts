import { Buffer } from 'node:buffer';
import { isMatch } from 'micromatch';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  Admin,
  ElectionPackageFileName,
  CastVoteRecordExportFileName,
  ContestId,
  DEFAULT_SYSTEM_SETTINGS,
  DiagnosticRecord,
  Id,
  PrinterStatus,
  SystemSettings,
  Tabulation,
  convertElectionResultsReportingReportToVxManualResults,
  ContestOptionId,
  getContests,
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
  generateSignedHashValidationQrCodeValue,
  prepareSignatureFile,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { Printer } from '@votingworks/printing';
import { createReadStream, promises as fs } from 'node:fs';
import path, { join } from 'node:path';
import {
  ELECTION_PACKAGE_FOLDER,
  generateElectionBasedSubfolderName,
  generateFilenameForElectionPackage,
  getBallotCount,
  getBallotStyleGroup,
  groupMapToGroupList,
  isIntegrationTest,
  isSystemAdministratorAuth,
  systemLimitViolationToString,
} from '@votingworks/utils';
import { dirSync } from 'tmp';
import {
  DiskSpaceSummary,
  ElectionPackageError,
  ElectionPackageWithFileContents,
  ExportDataError,
  createSystemCallApi,
  readElectionPackageFromBuffer,
  readElectionPackageFromFile,
} from '@votingworks/backend';
import {
  FileSystemEntry,
  FileSystemEntryType,
  readElection,
} from '@votingworks/fs';
import {
  ListDirectoryOnUsbDriveError,
  listDirectoryOnUsbDrive,
  UsbDrive,
  UsbDriveStatus,
} from '@votingworks/usb-drive';
import ZipStream from 'zip-stream';
import {
  CastVoteRecordFileRecord,
  CvrFileImportInfo,
  CvrFileMode,
  ElectionRecord,
  ExportDataResult,
  ImportCastVoteRecordsError,
  ManualResultsIdentifier,
  ManualResultsRecord,
  ScannerBatch,
  AdjudicationQueueMetadata,
  WriteInCandidateRecord,
  BallotImageView,
  ImportElectionResultsReportingError,
  ManualResultsMetadata,
  CastVoteRecordVoteInfo,
  WriteInRecord,
  VoteAdjudication,
  AdjudicatedCvrContest,
  CvrContestTag,
  BallotAdjudicationQueueMetadata,
  BallotAdjudicationData,
  BallotImages,
} from './types';
import { Workspace } from './util/workspace';
import { getMachineConfig } from './machine_config';
import {
  getBallotImageView,
  getBallotImagesAndLayouts,
} from './util/adjudication';
import {
  transformWriteInsAndSetManualResults,
  validateManualResults,
} from './util/manual_results';
import { addFileToZipStream } from './util/zip';
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
import { adjudicateCvrContest, getMarginalMarks } from './adjudication';
import { convertFrontendFilter as convertFrontendFilterUtil } from './util/filters';
import { buildElectionResultsReport } from './util/cdf_results';
import { tabulateElectionResults } from './tabulation/full_results';
import { NODE_ENV, REAL_USB_DRIVE_GLOB_PATTERN } from './globals';
import {
  exportWriteInAdjudicationReportPdf,
  generateWriteInAdjudicationReportPreview,
  printWriteInAdjudicationReport,
  WriteInAdjudicationReportPreview,
} from './reports/write_in_adjudication_report';
import {
  BallotCountReportPreview,
  BallotCountReportSpec,
  exportBallotCountReportPdf,
  generateBallotCountReportPreview,
  printBallotCountReport,
} from './reports/ballot_count_report';
import {
  TallyReportSpec,
  TallyReportPreview,
  generateTallyReportPreview,
  printTallyReport,
  exportTallyReportPdf,
} from './reports/tally_report';
import { printTestPage } from './reports/test_print';
import { saveReadinessReport } from './reports/readiness';
import { constructAuthMachineState } from './util/auth';
import { parseElectionResultsReportingFile } from './tabulation/election_results_reporting';
import { generateReportsDirectoryPath } from './util/filenames';

const debug = rootDebug.extend('app');

function loadCurrentElectionIdOrThrow(workspace: Workspace) {
  return assertDefined(workspace.store.getCurrentElectionId());
}

function getCurrentElectionRecord(
  workspace: Workspace
): Optional<ElectionRecord> {
  const electionId = workspace.store.getCurrentElectionId();
  /* istanbul ignore next - @preserve */
  if (!electionId) {
    return undefined;
  }
  const electionRecord = workspace.store.getElection(electionId);
  assert(electionRecord);
  return electionRecord;
}

function buildApi({
  auth,
  workspace,
  logger,
  usbDrive,
  printer,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
  printer: Printer;
}) {
  const { store } = workspace;

  function convertFrontendFilter(
    filter: Admin.FrontendReportingFilter
  ): Optional<Admin.ReportingFilter> {
    const electionId = loadCurrentElectionIdOrThrow(workspace);
    const {
      electionDefinition: { election },
    } = assertDefined(store.getElection(electionId));
    return convertFrontendFilterUtil(filter, election);
  }

  async function getTallyReportResults(
    input: Pick<TallyReportSpec, 'filter' | 'groupBy'>
  ): Promise<Tabulation.GroupList<Admin.TallyReportResults>> {
    const electionId = loadCurrentElectionIdOrThrow(workspace);
    return tabulateTallyReportResults({
      electionId,
      store,
      filter: convertFrontendFilter(input.filter),
      groupBy: input.groupBy,
    });
  }

  function getCardCounts(
    input: Pick<BallotCountReportSpec, 'filter' | 'groupBy'>
  ): Tabulation.GroupList<Tabulation.CardCounts> {
    const electionId = loadCurrentElectionIdOrThrow(workspace);
    return groupMapToGroupList(
      tabulateFullCardCounts({
        electionId,
        store,
        filter: convertFrontendFilter(input.filter),
        groupBy: input.groupBy,
      })
    );
  }

  function getElectionWriteInSummary(): Tabulation.ElectionWriteInSummary {
    const electionId = loadCurrentElectionIdOrThrow(workspace);
    return getOverallElectionWriteInSummary({
      electionId,
      store,
    });
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

    getPrinterStatus(): Promise<PrinterStatus> {
      return printer.status();
    },

    /* istanbul ignore next - @preserve */
    async generateSignedHashValidationQrCodeValue() {
      const { codeVersion } = getMachineConfig();
      const electionRecord = getCurrentElectionRecord(workspace);
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationInit);
      const qrCodeValue = await generateSignedHashValidationQrCodeValue({
        electionRecord,
        softwareVersion: codeVersion,
      });
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationComplete, {
        disposition: 'success',
      });
      return qrCodeValue;
    },

    async getUsbDriveStatus(): Promise<UsbDriveStatus> {
      return usbDrive.status();
    },

    async ejectUsbDrive(): Promise<void> {
      return usbDrive.eject();
    },

    async formatUsbDrive(): Promise<Result<void, Error>> {
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );
      if (!isSystemAdministratorAuth(authStatus)) {
        return err(
          new Error('Formatting USB drive requires system administrator auth.')
        );
      }

      try {
        await usbDrive.format();
        return ok();
      } catch (error) {
        return err(error as Error);
      }
    },

    async saveElectionPackageToUsb(): Promise<Result<void, ExportDataError>> {
      await logger.logAsCurrentRole(LogEventId.SaveElectionPackageInit);
      const exporter = buildExporter(usbDrive);

      const electionRecord = getCurrentElectionRecord(workspace);
      assert(electionRecord);
      const { electionDefinition, id: electionId } = electionRecord;
      const { election, ballotHash } = electionDefinition;

      const tempDirectory = dirSync().name;
      try {
        const electionPackageFileName = generateFilenameForElectionPackage(
          new Date()
        );
        const tempDirectoryElectionPackageFilePath = join(
          tempDirectory,
          electionPackageFileName
        );
        await fs.writeFile(
          tempDirectoryElectionPackageFilePath,
          assertDefined(
            workspace.store.getElectionPackageFileContents(electionId)
          )
        );

        const usbDriveElectionPackageDirectoryRelativePath = join(
          generateElectionBasedSubfolderName(election, ballotHash),
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
        /* istanbul ignore next: Tricky to make this second export err but the first export succeed
          without significant mocking @preserve */
        if (exportSignatureFileResult.isErr()) {
          return exportSignatureFileResult;
        }
      } finally {
        await fs.rm(tempDirectory, { recursive: true });
      }

      await logger.logAsCurrentRole(LogEventId.SaveElectionPackageComplete, {
        disposition: 'success',
        message: 'Successfully saved election package.',
      });
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
      const potentialElectionPackages: FileSystemEntry[] = [];

      for await (const result of listDirectoryOnUsbDrive(usbDrive, '', {
        depth: 3,
        excludeHidden: true,
      })) {
        if (result.isErr()) {
          return result;
        }

        const entry = result.ok();

        if (
          entry.type === FileSystemEntryType.File &&
          entry.name.endsWith('.zip')
        ) {
          potentialElectionPackages.push(entry);
        }
      }

      return ok(
        // Most recent first
        [...potentialElectionPackages].sort(
          (a, b) => b.ctime.getTime() - a.ctime.getTime()
        )
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

      const electionPackageResult: Result<
        ElectionPackageWithFileContents,
        ElectionPackageError
      > = await (async () => {
        if (input.electionFilePath.endsWith('.json')) {
          const electionDefinitionResult = await readElection(
            input.electionFilePath
          );
          if (electionDefinitionResult.isErr()) {
            return err({
              type: 'invalid-election',
              message: electionDefinitionResult.err().toString(),
            });
          }
          const electionDefinition = electionDefinitionResult.ok();
          const systemSettings = DEFAULT_SYSTEM_SETTINGS;

          const zipStream = new ZipStream();
          const zipPromise = deferred<void>();
          const chunks: Buffer[] = [];
          zipStream.on('error', zipPromise.reject);
          zipStream.on('end', zipPromise.resolve);
          zipStream.on('data', (chunk) => {
            assert(Buffer.isBuffer(chunk));
            chunks.push(chunk);
          });
          await addFileToZipStream(zipStream, {
            path: ElectionPackageFileName.ELECTION,
            contents: electionDefinition.electionData,
          });
          await addFileToZipStream(zipStream, {
            path: ElectionPackageFileName.SYSTEM_SETTINGS,
            contents: JSON.stringify(systemSettings, null, 2),
          });
          zipStream.finish();
          await zipPromise.promise;
          const fileContents = Buffer.concat(chunks);
          const result = await readElectionPackageFromBuffer(fileContents);
          /* istanbul ignore next - @preserve */
          return result.isErr() ? result : ok({ ...result.ok(), fileContents });
        }
        return await readElectionPackageFromFile(input.electionFilePath);
      })();

      if (electionPackageResult.isErr()) {
        const errorDetails = electionPackageResult.err();
        await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
          message: `Error configuring machine.`,
          disposition: 'failure',
          errorDetails:
            errorDetails.type === 'system-limit-violation'
              ? systemLimitViolationToString(errorDetails.violation)
              : JSON.stringify(errorDetails),
        });
        return electionPackageResult;
      }
      const { electionPackage, electionPackageHash, fileContents } =
        electionPackageResult.ok();

      const { electionDefinition, systemSettings } = electionPackage;
      const electionId = store.addElection({
        electionData: electionDefinition.electionData,
        systemSettingsData: JSON.stringify(systemSettings),
        electionPackageFileContents: fileContents,
        electionPackageHash,
      });
      store.setCurrentElectionId(electionId);
      await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
        disposition: 'success',
        newBallotHash: electionDefinition.ballotHash,
      });
      return ok({ electionId });
    },

    async unconfigure(): Promise<void> {
      store.reset();
      await logger.logAsCurrentRole(LogEventId.ElectionUnconfigured, {
        disposition: 'success',
      });
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

      await logger.logAsCurrentRole(LogEventId.MarkedTallyResultsOfficial, {
        message:
          'User has marked the tally results as official, no more cast vote record files can be loaded.',
        disposition: 'success',
        official: true,
      });
    },

    async revertResultsToUnofficial(): Promise<void> {
      store.setElectionResultsOfficial(
        loadCurrentElectionIdOrThrow(workspace),
        false
      );

      await logger.logAsCurrentRole(LogEventId.MarkedTallyResultsOfficial, {
        message: 'User reverted the tally results to unofficial.',
        disposition: 'success',
        official: false,
      });
    },

    async listCastVoteRecordFilesOnUsb() {
      const electionRecord = assertDefined(getCurrentElectionRecord(workspace));
      const { electionDefinition } = electionRecord;

      const listResult = await listCastVoteRecordExportsOnUsbDrive(
        usbDrive,
        electionDefinition
      );
      if (listResult.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ListCastVoteRecordExportsOnUsbDrive,
          {
            disposition: 'failure',
            message: 'Error listing cast vote record exports on USB drive.',
            reason: listResult.err(),
          }
        );
        return [];
      }
      const castVoteRecordExportSummaries = listResult.ok();
      await logger.logAsCurrentRole(
        LogEventId.ListCastVoteRecordExportsOnUsbDrive,
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
      await logger.logAsCurrentRole(LogEventId.ImportCastVoteRecordsInit, {
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
        exportDirectoryPath,
        logger
      );
      if (importResult.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ImportCastVoteRecordsComplete,
          {
            disposition: 'failure',
            message: 'Error importing cast vote records.',
            exportDirectoryPath,
            errorDetails: JSON.stringify(importResult.err()),
          }
        );
      } else {
        const { alreadyPresent: numAlreadyPresent, newlyAdded: numNewlyAdded } =
          importResult.ok();
        let message = `Successfully imported ${numNewlyAdded} cast vote record(s).`;
        if (numAlreadyPresent > 0) {
          message += ` Ignored ${numAlreadyPresent} duplicate(s).`;
        }
        await logger.logAsCurrentRole(
          LogEventId.ImportCastVoteRecordsComplete,
          {
            disposition: 'success',
            message,
            exportDirectoryPath,
          }
        );
      }
      return importResult;
    },

    async clearCastVoteRecordFiles(): Promise<void> {
      await logger.logAsCurrentRole(
        LogEventId.ClearImportedCastVoteRecordsInit,
        {
          message: 'Clearing imported cast vote records...',
        }
      );
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      store.deleteCastVoteRecordFiles(electionId);
      store.setElectionResultsOfficial(electionId, false);
      await logger.logAsCurrentRole(
        LogEventId.ClearImportedCastVoteRecordsComplete,
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

    adjudicateCvrContest(input: AdjudicatedCvrContest): void {
      adjudicateCvrContest(input, store, logger);
    },

    getCastVoteRecordVoteInfo(input: { cvrId: Id }): CastVoteRecordVoteInfo {
      return store.getCastVoteRecordVoteInfo({
        ...input,
        electionId: loadCurrentElectionIdOrThrow(workspace),
      });
    },

    getVoteAdjudications(input: {
      contestId: ContestId;
      cvrId: Id;
    }): VoteAdjudication[] {
      return store.getVoteAdjudications({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        contestId: input.contestId,
        cvrId: input.cvrId,
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

    getAdjudicationQueue(input: { contestId: ContestId }): Id[] {
      return store.getAdjudicationQueue({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        contestId: input.contestId,
      });
    },

    getAdjudicationQueueMetadata(): AdjudicationQueueMetadata[] {
      return store.getAdjudicationQueueMetadata({
        electionId: loadCurrentElectionIdOrThrow(workspace),
      });
    },

    getNextCvrIdForAdjudication(input: { contestId: ContestId }): Id | null {
      return (
        store.getNextCvrIdForAdjudication({
          ...input,
          electionId: loadCurrentElectionIdOrThrow(workspace),
        }) ?? null
      );
    },

    getWriteIns(input: { cvrId?: Id; contestId?: ContestId }): WriteInRecord[] {
      return store.getWriteInRecords({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        castVoteRecordId: input.cvrId,
        contestId: input.contestId,
      });
    },

    getBallotImageView(input: {
      cvrId: Id;
      contestId: ContestId;
    }): Promise<BallotImageView> {
      return getBallotImageView({
        store: workspace.store,
        cvrId: input.cvrId,
        contestId: input.contestId,
      });
    },

    getMarginalMarks(input: {
      cvrId: Id;
      contestId: ContestId;
    }): ContestOptionId[] {
      return getMarginalMarks({
        store: workspace.store,
        cvrId: input.cvrId,
        contestId: input.contestId,
      });
    },

    getCvrContestTag(input: {
      cvrId: Id;
      contestId: ContestId;
    }): CvrContestTag | undefined {
      return store.getCvrContestTag(input);
    },

    getBallotAdjudicationQueue(): Id[] {
      return store.getBallotAdjudicationQueue({
        electionId: loadCurrentElectionIdOrThrow(workspace),
      });
    },

    getBallotAdjudicationQueueMetadata(): BallotAdjudicationQueueMetadata {
      return store.getBallotAdjudicationQueueMetadata({
        electionId: loadCurrentElectionIdOrThrow(workspace),
      });
    },

    getNextCvrIdForBallotAdjudication(): Id | null {
      return (
        store.getNextCvrIdForBallotAdjudication({
          electionId: loadCurrentElectionIdOrThrow(workspace),
        }) ?? null
      );
    },

    getBallotAdjudicationData(input: { cvrId: Id }): BallotAdjudicationData {
      return store.getBallotAdjudicationData({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        cvrId: input.cvrId,
      });
    },

    getBallotImagesAndLayouts(input: { cvrId: Id }): Promise<BallotImages> {
      return getBallotImagesAndLayouts({
        store: workspace.store,
        cvrId: input.cvrId,
      });
    },

    async deleteAllManualResults(): Promise<void> {
      store.deleteAllManualResults({
        electionId: loadCurrentElectionIdOrThrow(workspace),
      });
      await logger.logAsCurrentRole(LogEventId.ManualTallyDataRemoved, {
        message: 'User removed all manually entered tally data.',
        disposition: 'success',
      });
    },

    async deleteManualResults(input: ManualResultsIdentifier): Promise<void> {
      store.deleteManualResults({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        ...input,
      });
      await logger.logAsCurrentRole(LogEventId.ManualTallyDataRemoved, {
        message:
          'User removed manually entered tally data for a particular ballot style, precinct, and voting method.',
        ...input,
        disposition: 'success',
      });
    },

    async setManualResults(
      input: ManualResultsIdentifier & {
        manualResults: Tabulation.ManualElectionResults;
      }
    ): Promise<void> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      await transformWriteInsAndSetManualResults({
        manualResults: input.manualResults,
        electionId,
        store,
        precinctId: input.precinctId,
        ballotStyleGroupId: input.ballotStyleGroupId,
        votingMethod: input.votingMethod,
      });

      await logger.logAsCurrentRole(LogEventId.ManualTallyDataEdited, {
        disposition: 'success',
        message:
          'User added or edited manually entered tally data for a particular ballot style, precinct, and voting method.',
        ballotCount: input.manualResults.ballotCount,
        ballotStyleGroupId: input.ballotStyleGroupId,
        precinctId: input.precinctId,
        ballotType: input.votingMethod,
      });
    },

    getManualResults(
      input: ManualResultsIdentifier
    ): ManualResultsRecord | null {
      const [manualResultsRecord] = store.getManualResults({
        electionId: loadCurrentElectionIdOrThrow(workspace),
        filter: {
          precinctIds: [input.precinctId],
          ballotStyleGroupIds: [input.ballotStyleGroupId],
          votingMethods: [input.votingMethod],
        },
      });

      return manualResultsRecord ?? null;
    },

    getManualResultsMetadata(): ManualResultsMetadata[] {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      const manualResultsRecords = store.getManualResults({
        electionId,
      });
      const {
        electionDefinition: { election },
      } = assertDefined(store.getElection(electionId));
      return manualResultsRecords.map((record) => {
        const { manualResults, ...metadata } = record;
        return {
          ...metadata,
          ballotCount: manualResults.ballotCount,
          validationError: validateManualResults(election, record),
        };
      });
    },

    // Parses the given ERR file and treats it as manual results.
    async importElectionResultsReportingFile(
      input: ManualResultsIdentifier & {
        filepath: string;
      }
    ): Promise<Result<void, ImportElectionResultsReportingError>> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      const electionRecord = store.getElection(electionId);
      assert(electionRecord);
      const { electionDefinition } = electionRecord;
      const { election } = electionDefinition;

      // Get the set of valid candidate IDs. File conversion will error
      // if it encounters a non-write-in candidate ID not in this list.
      const candidateIds = new Set<string>();
      for (const contest of election.contests) {
        if (contest.type === 'candidate') {
          for (const candidate of contest.candidates) {
            candidateIds.add(candidate.id);
          }
        }
      }

      const parseResult = await parseElectionResultsReportingFile(
        input.filepath,
        logger
      );

      if (parseResult.isErr()) {
        // Logging is handled by parseElectionResultsReportingFile
        return err({ type: 'parsing-failed' });
      }

      const electionReport = parseResult.ok();
      const wrappedManualResults =
        convertElectionResultsReportingReportToVxManualResults(
          electionReport,
          candidateIds
        );

      if (wrappedManualResults.isErr()) {
        await logger.logAsCurrentRole(LogEventId.ParseError, {
          message: 'Error converting ERR file to VX format',
          error: wrappedManualResults.err().message,
        });
        return err({ type: 'conversion-failed' });
      }

      const manualResults = wrappedManualResults.ok();

      // Filter down to the contests for the specified ballot style group
      const contestsForBallotStyleGroup = getContests({
        election,
        ballotStyle: assertDefined(
          getBallotStyleGroup({
            election,
            ballotStyleGroupId: input.ballotStyleGroupId,
          })
        ),
      });
      const contestIdsForBallotStyleGroup = new Set(
        contestsForBallotStyleGroup.map((contest) => contest.id)
      );
      const contestResultsForBallotStyleGroup = Object.fromEntries(
        Object.entries(manualResults.contestResults).filter(([contestId]) =>
          contestIdsForBallotStyleGroup.has(contestId)
        )
      );

      // The manual tally entry schema includes an overall ballot count for a ballot style group
      // and contest-level overrides. For most CDF ERR imports, we expect the ballot counts to be
      // the same for all contests in the ballot style group. One known exception is when we have a
      // non-partisan contest in a primary. The ballot count for this contest will be double others
      // if there are two parties, triple if there are three, etc. It's for this case that we opt
      // for the minimum for the overall ballot count for the ballot style group.
      const ballotCountForBallotStyleGroup = Math.min(
        ...Object.entries(contestResultsForBallotStyleGroup).map(
          ([, contestResults]) => contestResults.ballots
        )
      );

      const manualResultsForBallotStyleGroup: Tabulation.ManualElectionResults =
        {
          ballotCount: ballotCountForBallotStyleGroup,
          contestResults: contestResultsForBallotStyleGroup,
        };

      await transformWriteInsAndSetManualResults({
        manualResults: manualResultsForBallotStyleGroup,
        electionId,
        store,
        precinctId: input.precinctId,
        ballotStyleGroupId: input.ballotStyleGroupId,
        votingMethod: input.votingMethod,
      });

      await logger.logAsCurrentRole(
        LogEventId.ElectionResultsReportingTallyFileImported,
        {
          disposition: 'success',
          message:
            'User imported an Election Results Reporting file with tally data for a particular ballot style, precinct, and voting method.',
          ballotCount: manualResultsForBallotStyleGroup.ballotCount,
          ballotStyleGroupId: input.ballotStyleGroupId,
          precinctId: input.precinctId,
          ballotType: input.votingMethod,
        }
      );

      return ok();
    },

    getScannerBatches(): ScannerBatch[] {
      return store.getScannerBatches(loadCurrentElectionIdOrThrow(workspace));
    },

    async getResultsForTallyReports(
      input: Pick<TallyReportSpec, 'filter' | 'groupBy'> = {
        filter: {},
        groupBy: {},
      }
    ): Promise<Tabulation.GroupList<Admin.TallyReportResults>> {
      return getTallyReportResults(input);
    },

    async getTallyReportPreview(
      input: TallyReportSpec
    ): Promise<TallyReportPreview> {
      return generateTallyReportPreview({
        store,
        allTallyReportResults: await getTallyReportResults(input),
        ...input,
        logger,
      });
    },

    async printTallyReport(input: TallyReportSpec): Promise<void> {
      return printTallyReport({
        store,
        allTallyReportResults: await getTallyReportResults(input),
        ...input,
        logger,
        printer,
      });
    },

    async exportTallyReportPdf(
      input: TallyReportSpec & { filename: string }
    ): Promise<ExportDataResult> {
      return await exportTallyReportPdf({
        store,
        allTallyReportResults: await getTallyReportResults(input),
        usbDrive,
        logger,
        ...input,
      });
    },

    async exportTallyReportCsv(
      input: Pick<TallyReportSpec, 'filter' | 'groupBy'> & {
        filename: string;
      }
    ): Promise<ExportDataResult> {
      debug('exporting tally report CSV file: %o', input);
      const electionRecord = assertDefined(getCurrentElectionRecord(workspace));
      const { electionDefinition } = electionRecord;

      const exporter = buildExporter(usbDrive);
      const reportsDirectoryPath =
        generateReportsDirectoryPath(electionDefinition);
      const exportFileResult = await exporter.exportDataToUsbDrive(
        reportsDirectoryPath,
        input.filename,
        generateTallyReportCsv({
          store,
          filter: convertFrontendFilter(input.filter),
          groupBy: input.groupBy,
          filename: input.filename,
        })
      );

      const reportPath = join(reportsDirectoryPath, input.filename);
      await logger.logAsCurrentRole(LogEventId.FileSaved, {
        disposition: exportFileResult.isOk() ? 'success' : 'failure',
        message: `${
          exportFileResult.isOk() ? 'Saved' : 'Failed to save'
        } tally report CSV file to ${reportPath} on the USB drive.`,
        path: reportPath,
      });

      return exportFileResult;
    },

    async exportCdfElectionResultsReport(input: {
      filename: string;
    }): Promise<ExportDataResult> {
      const electionId = loadCurrentElectionIdOrThrow(workspace);
      const electionRecord = store.getElection(electionId);
      assert(electionRecord);
      const {
        isOfficialResults,
        electionDefinition,
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
        })
      )[0];
      assert(electionResults);

      debug('exporting CDF election results report JSON file: %o', input);

      const exporter = buildExporter(usbDrive);
      const reportsDirectoryPath =
        generateReportsDirectoryPath(electionDefinition);
      const exportFileResult = await exporter.exportDataToUsbDrive(
        reportsDirectoryPath,
        input.filename,
        JSON.stringify(
          buildElectionResultsReport({
            election,
            electionResults,
            isOfficialResults,
            isTestMode,
            writeInCandidates,
            machineConfig: getMachineConfig(),
          })
        )
      );

      const reportPath = join(reportsDirectoryPath, input.filename);
      await logger.logAsCurrentRole(LogEventId.FileSaved, {
        disposition: exportFileResult.isOk() ? 'success' : 'failure',
        message: `${
          exportFileResult.isOk() ? 'Saved' : 'Failed to save'
        } CDF election results report JSON file to ${reportPath} on the USB drive.`,
        path: reportPath,
      });

      return exportFileResult;
    },

    getCardCounts(
      input: Pick<BallotCountReportSpec, 'filter' | 'groupBy'>
    ): Array<Tabulation.GroupOf<Tabulation.CardCounts>> {
      return getCardCounts(input);
    },

    getTotalBallotCount(): number {
      const [cardCounts] = getCardCounts({
        filter: {},
        groupBy: {},
      });
      assert(cardCounts);
      return getBallotCount(cardCounts);
    },

    async getBallotCountReportPreview(
      input: BallotCountReportSpec
    ): Promise<BallotCountReportPreview> {
      return generateBallotCountReportPreview({
        store,
        allCardCounts: getCardCounts(input),
        ...input,
        logger,
      });
    },

    async printBallotCountReport(input: BallotCountReportSpec): Promise<void> {
      return printBallotCountReport({
        store,
        allCardCounts: getCardCounts(input),
        ...input,
        logger,
        printer,
      });
    },

    async exportBallotCountReportPdf(
      input: BallotCountReportSpec & { filename: string }
    ): Promise<ExportDataResult> {
      return exportBallotCountReportPdf({
        store,
        allCardCounts: getCardCounts(input),
        usbDrive,
        logger,
        ...input,
      });
    },

    async exportBallotCountReportCsv(
      input: BallotCountReportSpec & {
        filename: string;
      }
    ): Promise<ExportDataResult> {
      debug('exporting ballot count report CSV file: %o', input);
      const electionRecord = assertDefined(getCurrentElectionRecord(workspace));
      const { electionDefinition } = electionRecord;

      const exporter = buildExporter(usbDrive);
      const reportsDirectoryPath =
        generateReportsDirectoryPath(electionDefinition);
      const exportFileResult = await exporter.exportDataToUsbDrive(
        reportsDirectoryPath,
        input.filename,
        generateBallotCountReportCsv({
          store,
          filter: convertFrontendFilter(input.filter),
          groupBy: input.groupBy,
          includeSheetCounts: input.includeSheetCounts,
          filename: input.filename,
        })
      );

      const reportPath = join(reportsDirectoryPath, input.filename);
      await logger.logAsCurrentRole(LogEventId.FileSaved, {
        disposition: exportFileResult.isOk() ? 'success' : 'failure',
        message: `${
          exportFileResult.isOk() ? 'Saved' : 'Failed to save'
        } ballot count report CSV file to ${reportPath} on the USB drive.`,
        path: reportPath,
      });

      return exportFileResult;
    },

    getElectionWriteInSummary(): Tabulation.ElectionWriteInSummary {
      return getElectionWriteInSummary();
    },

    async getWriteInAdjudicationReportPreview(): Promise<WriteInAdjudicationReportPreview> {
      return generateWriteInAdjudicationReportPreview({
        store,
        electionWriteInSummary: getElectionWriteInSummary(),
        logger,
      });
    },

    async printWriteInAdjudicationReport(): Promise<void> {
      return printWriteInAdjudicationReport({
        store,
        electionWriteInSummary: getElectionWriteInSummary(),
        logger,
        printer,
      });
    },

    async exportWriteInAdjudicationReportPdf(input: {
      filename: string;
    }): Promise<ExportDataResult> {
      return exportWriteInAdjudicationReportPdf({
        store,
        electionWriteInSummary: getElectionWriteInSummary(),
        usbDrive,
        logger,
        ...input,
      });
    },

    addDiagnosticRecord(input: Omit<DiagnosticRecord, 'timestamp'>): void {
      store.addDiagnosticRecord(input);
      void logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
        disposition: input.outcome === 'pass' ? 'success' : 'failure',
        message: `Diagnostic (${input.type}) completed with outcome: ${input.outcome}.`,
      });
    },

    getMostRecentPrinterDiagnostic(): DiagnosticRecord | null {
      return store.getMostRecentDiagnosticRecord('test-print') ?? null;
    },

    async printTestPage(): Promise<void> {
      await printTestPage({
        printer,
        logger,
      });
    },

    async saveReadinessReport(): Promise<ExportDataResult> {
      return saveReadinessReport({
        workspace,
        printer,
        usbDrive,
        logger,
      });
    },

    async getDiskSpaceSummary(): Promise<DiskSpaceSummary> {
      return workspace.getDiskSpaceSummary();
    },

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId: getMachineConfig().machineId,
      codeVersion: getMachineConfig().codeVersion,
    }),
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
  printer,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
  printer: Printer;
}): Application {
  const app: Application = express();
  const api = buildApi({ auth, workspace, logger, usbDrive, printer });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
