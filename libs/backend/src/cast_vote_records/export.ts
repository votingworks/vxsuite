import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  computeCastVoteRecordRootHashFromScratch,
  computeSingleCastVoteRecordHash,
  HashableFile,
  prepareSignatureFile,
  ReadableFile,
  readableFileFromData,
  readableFileFromDisk,
} from '@votingworks/auth';
import {
  assert,
  assertDefined,
  err,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  BallotIdSchema,
  BatchInfo,
  CastVoteRecordExportFileName,
  CastVoteRecordExportMetadata,
  CastVoteRecordReportWithoutMetadata,
  CVR,
  ElectionDefinition,
  ExportCastVoteRecordsToUsbDriveError,
  Id,
  mapSheet,
  MarkThresholds,
  PageInterpretation,
  PollsState,
  SheetOf,
  SystemSettings,
  unsafeParse,
} from '@votingworks/types';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import {
  generateCastVoteRecordExportDirectoryName,
  generateElectionBasedSubfolderName,
  getCastVoteRecordExportSubDirectoryNames,
  hasWriteIns,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';

import { Exporter } from '../exporter';
import { SCAN_ALLOWED_EXPORT_PATTERNS, VX_MACHINE_ID } from '../scan_globals';
import {
  buildCastVoteRecord as baseBuildCastVoteRecord,
  CvrImageDataInput,
} from './build_cast_vote_record';
import {
  buildBatchManifest,
  buildCastVoteRecordReportMetadata as baseBuildCastVoteRecordReportMetadata,
} from './build_report_metadata';
import { CanonicalizedSheet, canonicalizeSheet } from './canonicalize';
import {
  recoverAfterInterruptedCreationTimestampUpdate,
  updateCreationTimestampOfDirectoryAndChildrenFiles,
} from './file_system_utils';
import { readCastVoteRecordExportMetadata } from './import';
import { buildElectionOptionPositionMap } from './option_map';

/**
 * An election definition and the election package hash.
 */
export interface ElectionRecord {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
}

/**
 * Methods shared by both {@link CentralScannerStore} and {@link PrecinctScannerStore}
 */
export interface ScannerStoreBase {
  clearCastVoteRecordHashes(): void;
  getBatches(): BatchInfo[];
  getCastVoteRecordRootHash(): string;
  getElectionRecord(): ElectionRecord | undefined;
  getSystemSettings(): SystemSettings | undefined;
  getTestMode(): boolean;
  updateCastVoteRecordHashes(
    castVoteRecordId: string,
    castVoteRecordHash: string
  ): void;
}

/**
 * The subset of central scanner store methods relevant to exporting cast vote records
 */
export interface CentralScannerStore extends ScannerStoreBase {
  scannerType: 'central';
}

/**
 * The subset of precinct scanner store methods relevant to exporting cast vote records
 */
export interface PrecinctScannerStore extends ScannerStoreBase {
  scannerType: 'precinct';

  deleteAllPendingContinuousExportOperations(): void;
  deletePendingContinuousExportOperation(sheetId: string): void;
  getBallotsCounted(): number;
  getExportDirectoryName(): string | undefined;
  getIsContinuousExportEnabled(): boolean;
  getPendingContinuousExportOperations(): string[];
  getPollsState(): PollsState;
  setExportDirectoryName(exportDirectoryName: string): void;
}

/**
 * The subset of scanner store methods relevant to exporting cast vote records
 */
export type ScannerStore = CentralScannerStore | PrecinctScannerStore;

/**
 * State that can be retrieved via the ScannerStore interface and that is unchanged by exporting
 * cast vote records
 */
interface ScannerStateUnchangedByExport {
  batches: BatchInfo[];
  electionDefinition: ElectionDefinition;
  systemSettings: SystemSettings;
  inTestMode: boolean;
  markThresholds: MarkThresholds;
  pollsState?: PollsState;
}

interface CentralScannerOptions {
  scannerType: 'central';
  /**
   * A minimal export includes only the images that are absolutely necessary for tabulation, i.e.
   * images for accepted ballots with write-ins.
   */
  isMinimalExport?: boolean;
}

interface PrecinctScannerOptions {
  scannerType: 'precinct';
  arePollsClosing?: boolean;
  /**
   * Precinct scanners export continuously as ballots are cast, but also still support full exports
   * of all cast ballots. (Central scanners, on the other hand, don't export continuously and only
   * support full exports.)
   */
  isFullExport?: boolean;
  /**
   * An export performed to recover after an error, e.g., a sporadic USB disconnect
   */
  isRecoveryExport?: boolean;
}

/**
 * Options for {@link exportCastVoteRecordsToUsbDrive}
 */
export type ExportOptions = CentralScannerOptions | PrecinctScannerOptions;

/**
 * A grouping of inputs needed by helpers throughout this file
 */
interface ExportContext {
  exporter: Exporter;
  exportOptions: ExportOptions;
  scannerState: ScannerStateUnchangedByExport;
  scannerStore: ScannerStore;
  usbMountPoint: string;
}

/**
 * A scanned sheet that was accepted and should be tabulated
 */
export interface AcceptedSheet {
  readonly type: 'accepted';
  readonly id: Id;
  readonly batchId: Id;
  readonly ballotAuditId?: Id;
  readonly interpretation: SheetOf<PageInterpretation>;
  readonly frontImagePath: string;
  readonly backImagePath: string;

  /**
   * Required per VVSG 2.0 1.1.5-G.7 but only relevant for central scanners. On precinct scanners,
   * this would compromise voter privacy.
   */
  readonly indexInBatch?: number;
}

/**
 * A scanned sheet that was rejected
 */
export interface RejectedSheet {
  readonly type: 'rejected';
  readonly id: Id;
  readonly ballotAuditId?: Id;
  readonly frontImagePath: string;
  readonly backImagePath: string;
}

/**
 * A scanned sheet, accepted or rejected
 */
export type Sheet = AcceptedSheet | RejectedSheet;

//
// Helpers
//

/**
 * A cached result for {@link doesUsbDriveRequireCastVoteRecordSync}. See
 * {@link doesUsbDriveRequireCastVoteRecordSync} for more context.
 */
let doesUsbDriveRequireCastVoteRecordSyncCachedResult:
  | { previousUsbDriveStatus: UsbDriveStatus; previousValue: boolean }
  | undefined;

/**
 * Clears {@link doesUsbDriveRequireCastVoteRecordSyncCachedResult}
 */
export function clearDoesUsbDriveRequireCastVoteRecordSyncCachedResult(): void {
  doesUsbDriveRequireCastVoteRecordSyncCachedResult = undefined;
}

function isMinimalExport(exportOptions: ExportOptions): boolean {
  return Boolean(
    exportOptions.scannerType === 'central' && exportOptions.isMinimalExport
  );
}

function shouldIncludeImagesInMinimalExport(
  canonicalizedSheet: CanonicalizedSheet
): boolean {
  return (
    (canonicalizedSheet.type === 'hmpb' &&
      canonicalizedSheet.interpretation.some(
        ({ votes, unmarkedWriteIns }) =>
          hasWriteIns(votes) ||
          (unmarkedWriteIns && unmarkedWriteIns.length > 0)
      )) ||
    (canonicalizedSheet.type === 'bmd' &&
      hasWriteIns(canonicalizedSheet.interpretation.votes))
  );
}

/**
 * Returns the export directory path relative to the USB mount point. Creates a new export
 * directory if one hasn't been created yet or if we're performing a full export.
 *
 * If we're performing a full export before polls close on VxScan, after the export finishes, this
 * function will have us switch to the new directory for continuous export. This provides a path
 * for getting the continuous export directory back to a good state after an unexpected failure.
 */
async function getExportDirectoryPathRelativeToUsbMountPoint(
  exportContext: ExportContext,
  options: { errIfDirectoryNeedsToBeCreated?: boolean }
): Promise<Result<string, 'directory-needs-to-be-created'>> {
  const { exportOptions, scannerState, scannerStore, usbMountPoint } =
    exportContext;
  const { electionDefinition, inTestMode } = scannerState;
  const { election, ballotHash } = electionDefinition;

  let exportDirectoryName: string | undefined;
  switch (exportOptions.scannerType) {
    case 'central': {
      exportDirectoryName = generateCastVoteRecordExportDirectoryName({
        inTestMode,
        machineId: VX_MACHINE_ID,
      });
      break;
    }
    case 'precinct': {
      assert(scannerStore.scannerType === 'precinct');
      exportDirectoryName = scannerStore.getExportDirectoryName();
      if (!exportDirectoryName || exportOptions.isFullExport) {
        exportDirectoryName = generateCastVoteRecordExportDirectoryName({
          inTestMode,
          machineId: VX_MACHINE_ID,
        });
        scannerStore.setExportDirectoryName(exportDirectoryName);
      }
      break;
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(exportOptions, 'scannerType');
    }
  }

  const exportDirectoryPathRelativeToUsbMountPoint = path.join(
    generateElectionBasedSubfolderName(election, ballotHash),
    SCANNER_RESULTS_FOLDER,
    exportDirectoryName
  );
  const exportDirectoryPath = path.join(
    usbMountPoint,
    exportDirectoryPathRelativeToUsbMountPoint
  );

  if (
    options.errIfDirectoryNeedsToBeCreated &&
    !existsSync(exportDirectoryPath)
  ) {
    return err('directory-needs-to-be-created');
  }
  await fs.mkdir(exportDirectoryPath, { recursive: true });
  return ok(exportDirectoryPathRelativeToUsbMountPoint);
}

function buildCastVoteRecordReportMetadata(
  exportContext: ExportContext,
  options: { hideTime?: boolean } = {}
): CVR.CastVoteRecordReport {
  const { scannerState } = exportContext;
  const { batches, electionDefinition, inTestMode } = scannerState;
  const { election, ballotHash: electionId } = electionDefinition;
  const scannerId = VX_MACHINE_ID;

  return baseBuildCastVoteRecordReportMetadata({
    batchInfo: batches,
    election,
    electionId,
    generatedDate: options.hideTime
      ? election.date.toMidnightDatetimeWithSystemTimezone()
      : undefined,
    generatingDeviceId: scannerId,
    isTestMode: inTestMode,
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    scannerIds: [scannerId],
  });
}

async function buildCastVoteRecord(
  exportContext: ExportContext,
  sheet: AcceptedSheet,
  canonicalizedSheet: CanonicalizedSheet,
  referencedFiles?: {
    imageFiles: SheetOf<HashableFile>;
    layoutFiles?: SheetOf<HashableFile>;
  }
): Promise<CVR.CVR> {
  const { scannerState } = exportContext;
  const { electionDefinition, systemSettings, markThresholds } = scannerState;
  const { election, ballotHash: electionId } = electionDefinition;
  const electionOptionPositionMap = buildElectionOptionPositionMap(election);
  const scannerId = VX_MACHINE_ID;

  const { id, batchId, indexInBatch, ballotAuditId } = sheet;
  const castVoteRecordId =
    (canonicalizedSheet.type === 'bmd' &&
      canonicalizedSheet.interpretation.ballotId) ||
    unsafeParse(BallotIdSchema, id);
  const images: SheetOf<CvrImageDataInput> | undefined = referencedFiles
    ? await mapSheet(
        referencedFiles.imageFiles,
        referencedFiles.layoutFiles ?? [undefined, undefined],
        async (imageFile, layoutFile) => ({
          imageHash: await imageFile.computeSha256Hash(),
          imageRelativePath: imageFile.fileName,
          layoutFileHash: await layoutFile?.computeSha256Hash(),
        })
      )
    : undefined;

  // BMD ballot
  if (canonicalizedSheet.type === 'bmd') {
    return baseBuildCastVoteRecord({
      ballotMarkingMode: 'machine',
      batchId,
      ballotAuditId,
      castVoteRecordId,
      electionDefinition,
      electionId,
      electionOptionPositionMap,
      images,
      interpretation: canonicalizedSheet.interpretation,
      scannerId,
    });
  }

  // HMPB ballot
  const [frontInterpretation, backInterpretation] =
    canonicalizedSheet.interpretation;
  return baseBuildCastVoteRecord({
    ballotMarkingMode: 'hand',
    batchId,
    ballotAuditId,
    castVoteRecordId,
    definiteMarkThreshold: markThresholds.definite,
    electionDefinition,
    electionId,
    electionOptionPositionMap,
    includeOriginalSnapshots:
      systemSettings.castVoteRecordsIncludeOriginalSnapshots,
    images,
    indexInBatch,
    interpretations: [frontInterpretation, backInterpretation],
    scannerId,
  });
}

/**
 * Exports the following for a single cast vote record:
 * - The cast vote record report (JSON)
 * - The front image (JPEG)
 * - The back image (JPEG)
 * - If an HMPB, the front interpretation layout (JSON)
 * - If an HMPB, the back interpretation layout (JSON)
 *
 * Returns the cast vote record ID and a hash of the above contents.
 */
async function exportCastVoteRecordFilesToUsbDrive(
  exportContext: ExportContext,
  sheet: AcceptedSheet,
  exportDirectoryPathRelativeToUsbMountPoint: string
): Promise<
  Result<
    { castVoteRecordId: string; castVoteRecordHash: string },
    ExportCastVoteRecordsToUsbDriveError
  >
> {
  const { exporter, exportOptions } = exportContext;

  const canonicalizeSheetResult = canonicalizeSheet(sheet.interpretation, [
    sheet.frontImagePath,
    sheet.backImagePath,
  ]);
  if (canonicalizeSheetResult.isErr()) {
    return canonicalizeSheetResult;
  }
  const canonicalizedSheet = canonicalizeSheetResult.ok();

  const shouldIncludeImages = isMinimalExport(exportOptions)
    ? shouldIncludeImagesInMinimalExport(canonicalizedSheet)
    : true;

  const castVoteRecordFilesToExport: ReadableFile[] = [];
  let imageFiles: SheetOf<ReadableFile> | undefined;
  let layoutFiles: SheetOf<ReadableFile> | undefined;
  if (shouldIncludeImages) {
    const [frontImagePath, backImagePath] = canonicalizedSheet.filenames;
    imageFiles = [
      readableFileFromDisk(frontImagePath),
      readableFileFromDisk(backImagePath),
    ];
    castVoteRecordFilesToExport.push(...imageFiles);
    if (canonicalizedSheet.type === 'hmpb') {
      const [frontInterpretation, backInterpretation] =
        canonicalizedSheet.interpretation;
      layoutFiles = [
        readableFileFromData(
          `${path.parse(frontImagePath).name}.layout.json`,
          JSON.stringify(frontInterpretation.layout)
        ),
        readableFileFromData(
          `${path.parse(backImagePath).name}.layout.json`,
          JSON.stringify(backInterpretation.layout)
        ),
      ];
      castVoteRecordFilesToExport.push(...layoutFiles);
    }
  }

  const castVoteRecordReportMetadata = exportContext.scannerState.systemSettings
    .castVoteRecordsIncludeRedundantMetadata
    ? buildCastVoteRecordReportMetadata(
        exportContext,
        // Hide the time in the metadata for individual cast vote records so that we don't reveal the
        // order in which ballots were cast
        { hideTime: true }
      )
    : undefined;
  const castVoteRecord = await buildCastVoteRecord(
    exportContext,
    sheet,
    canonicalizedSheet,
    imageFiles ? { imageFiles, layoutFiles } : undefined
  );
  const castVoteRecordId = castVoteRecord.UniqueId;
  const castVoteRecordReport:
    | CVR.CastVoteRecordReport
    | CastVoteRecordReportWithoutMetadata = {
    ...(castVoteRecordReportMetadata ?? {}),
    CVR: [castVoteRecord],
  };

  const castVoteRecordReportFile = readableFileFromData(
    CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT,
    JSON.stringify(castVoteRecordReport)
  );
  castVoteRecordFilesToExport.push(castVoteRecordReportFile);

  for (const file of castVoteRecordFilesToExport) {
    const exportResult = await exporter.exportDataToUsbDrive(
      exportDirectoryPathRelativeToUsbMountPoint,
      path.join(castVoteRecordId, file.fileName),
      file.open()
    );
    /* istanbul ignore next: Hard to trigger without significant mocking */
    if (exportResult.isErr()) {
      return exportResult;
    }
  }

  const castVoteRecordHash = await computeSingleCastVoteRecordHash(
    castVoteRecordId,
    castVoteRecordReportFile
  );

  return ok({ castVoteRecordId, castVoteRecordHash });
}

async function exportRejectedSheetToUsbDrive(
  exportContext: ExportContext,
  sheet: RejectedSheet,
  exportDirectoryPathRelativeToUsbMountPoint: string
): Promise<
  Result<{ subDirectoryName: string }, ExportCastVoteRecordsToUsbDriveError>
> {
  const { exporter } = exportContext;

  const subDirectoryName = `${CastVoteRecordExportFileName.REJECTED_SHEET_SUB_DIRECTORY_NAME_PREFIX}${sheet.id}`;
  const filesToExport: ReadableFile[] = [
    readableFileFromDisk(sheet.frontImagePath),
    readableFileFromDisk(sheet.backImagePath),
  ];
  for (const file of filesToExport) {
    const exportResult = await exporter.exportDataToUsbDrive(
      exportDirectoryPathRelativeToUsbMountPoint,
      path.join(subDirectoryName, file.fileName),
      file.open()
    );
    /* istanbul ignore next: Hard to trigger without significant mocking */
    if (exportResult.isErr()) {
      return exportResult;
    }
  }

  return ok({ subDirectoryName });
}

/**
 * Exports a top-level metadata file for a cast vote record export
 */
async function exportMetadataFileToUsbDrive(
  exportContext: ExportContext,
  castVoteRecordRootHash: string,
  exportDirectoryPathRelativeToUsbMountPoint: string
): Promise<
  Result<{ metadataFileContents: string }, ExportCastVoteRecordsToUsbDriveError>
> {
  const { exporter, exportOptions, scannerState } = exportContext;
  const { pollsState } = scannerState;

  let arePollsClosed: boolean | undefined;
  switch (exportOptions.scannerType) {
    case 'central': {
      arePollsClosed = undefined;
      break;
    }
    case 'precinct': {
      assert(pollsState !== undefined);
      arePollsClosed = Boolean(
        pollsState === 'polls_closed_final' || exportOptions.arePollsClosing
      );
      break;
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(exportOptions, 'scannerType');
    }
  }

  const metadata: CastVoteRecordExportMetadata = {
    arePollsClosed,
    castVoteRecordReportMetadata:
      buildCastVoteRecordReportMetadata(exportContext),
    castVoteRecordRootHash,
    batchManifest: buildBatchManifest({
      batchInfo: exportContext.scannerState.batches.map((batch) => ({
        ...batch,
        scannerId: VX_MACHINE_ID,
      })),
    }),
  };
  const metadataFileContents = JSON.stringify(metadata);

  const exportResult = await exporter.exportDataToUsbDrive(
    exportDirectoryPathRelativeToUsbMountPoint,
    CastVoteRecordExportFileName.METADATA,
    metadataFileContents
  );
  /* istanbul ignore next: Hard to trigger without significant mocking */
  if (exportResult.isErr()) {
    return exportResult;
  }

  return ok({ metadataFileContents });
}

/**
 * Exports a signature file for a cast vote record export
 */
async function exportSignatureFileToUsbDrive(
  exportContext: ExportContext,
  metadataFileContents: string,
  exportDirectoryPathRelativeToUsbMountPoint: string
): Promise<Result<void, ExportCastVoteRecordsToUsbDriveError>> {
  const { exporter } = exportContext;

  const signatureFile = await prepareSignatureFile({
    type: 'cast_vote_records',
    context: 'export',
    directoryName: path.basename(exportDirectoryPathRelativeToUsbMountPoint),
    metadataFileContents,
  });

  const exportResult = await exporter.exportDataToUsbDrive(
    // The signature file should live adjacent to the export directory, not within it.
    path.parse(exportDirectoryPathRelativeToUsbMountPoint).dir,
    signatureFile.fileName,
    signatureFile.fileContents
  );
  /* istanbul ignore next: Hard to trigger without significant mocking */
  if (exportResult.isErr()) {
    return exportResult;
  }

  return ok();
}

/**
 * File creation timestamps could reveal the order in which ballots were cast. To maintain
 * voter privacy, every time a ballot is cast, we randomly select 1 or 2 previous ballots and
 * update their creation timestamps to the present. This approach is equivalent to moving random
 * ballots to the top of a stack every time a new ballot is added to the stack, a kind of shuffling
 * as we go.
 *
 * This shuffling is irrelevant for full exports, where we already iterate over ballots in an order
 * independent of creation timestamp.
 */
async function randomlyUpdateCreationTimestamps(
  exportContext: ExportContext,
  exportDirectoryPathRelativeToUsbMountPoint: string,
  options: { subDirectoryNameToIgnore?: string } = {}
): Promise<void> {
  const { usbMountPoint } = exportContext;

  const exportDirectoryPath = path.join(
    usbMountPoint,
    exportDirectoryPathRelativeToUsbMountPoint
  );
  const subDirectoryNames = (
    await getCastVoteRecordExportSubDirectoryNames(exportDirectoryPath)
  ).filter(
    (subDirectoryName) => subDirectoryName !== options.subDirectoryNameToIgnore
  );

  if (subDirectoryNames.length === 0) {
    return;
  }

  const oneOrTwo = crypto.randomInt(1, 3);
  for (let i = 0; i < oneOrTwo; i += 1) {
    const randomSubDirectoryName = assertDefined(
      subDirectoryNames[crypto.randomInt(0, subDirectoryNames.length)]
    );
    const subDirectoryPath = path.join(
      exportDirectoryPath,
      randomSubDirectoryName
    );
    await updateCreationTimestampOfDirectoryAndChildrenFiles(subDirectoryPath);
  }
}

//
// Top-level functions
//

/**
 * Exports cast vote records from a scanner to a USB drive. Supports both continuous and batch
 * export use cases.
 */
export async function exportCastVoteRecordsToUsbDrive(
  scannerStore: ScannerStore,
  usbDrive: UsbDrive,
  sheets: Iterable<Sheet>,
  exportOptions: ExportOptions
): Promise<Result<void, ExportCastVoteRecordsToUsbDriveError>> {
  assert(scannerStore.scannerType === exportOptions.scannerType);
  const usbDriveStatus = await usbDrive.status();
  const usbMountPoint =
    usbDriveStatus.status === 'mounted' ? usbDriveStatus.mountPoint : undefined;
  if (usbMountPoint === undefined) {
    return err({ type: 'missing-usb-drive' });
  }
  const systemSettings = assertDefined(scannerStore.getSystemSettings());
  const exportContext: ExportContext = {
    exporter: new Exporter({
      allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
      usbDrive,
    }),
    exportOptions,
    scannerState: {
      batches: scannerStore.getBatches(),
      electionDefinition: assertDefined(scannerStore.getElectionRecord())
        .electionDefinition,
      systemSettings,
      inTestMode: scannerStore.getTestMode(),
      markThresholds: systemSettings.markThresholds,
      pollsState:
        scannerStore.scannerType === 'precinct'
          ? scannerStore.getPollsState()
          : undefined,
    },
    scannerStore,
    usbMountPoint,
  };

  // Before a full export, clear cast vote record hashes so that they can be recomputed from
  // scratch. This is particularly important for VxCentralScan, where batches can be deleted
  // between exports.
  if (exportOptions.scannerType === 'central' || exportOptions.isFullExport) {
    scannerStore.clearCastVoteRecordHashes();
  }

  const isRecoveryExport =
    exportOptions.scannerType === 'precinct' && exportOptions.isRecoveryExport;

  const exportDirectoryResult =
    await getExportDirectoryPathRelativeToUsbMountPoint(exportContext, {
      errIfDirectoryNeedsToBeCreated: isRecoveryExport,
    });
  if (exportDirectoryResult.isErr()) {
    assert(
      isRecoveryExport &&
        exportDirectoryResult.err() === 'directory-needs-to-be-created'
    );
    return err({
      type: 'recovery-export-error',
      subType: 'expected-export-directory-does-not-exist',
    });
  }
  const exportDirectoryPathRelativeToUsbMountPoint = exportDirectoryResult.ok();
  const exportDirectoryPath = path.join(
    usbMountPoint,
    exportDirectoryPathRelativeToUsbMountPoint
  );

  const isCreationTimestampShufflingNecessary =
    exportOptions.scannerType === 'precinct' && !exportOptions.isFullExport;

  if (isRecoveryExport) {
    await recoverAfterInterruptedCreationTimestampUpdate(exportDirectoryPath);
  }

  const castVoteRecordHashes: { [castVoteRecordId: string]: string } = {};
  const sheetIds: string[] = [];
  for (const sheet of sheets) {
    assert(
      !(isMinimalExport(exportOptions) && sheet.type === 'rejected'),
      'Encountered an unexpected rejected sheet while performing a minimal export. ' +
        'Minimal exports should only include accepted sheets.'
    );
    sheetIds.push(sheet.id);

    if (isRecoveryExport) {
      // Clean up any remnants from past failed exports
      await fs.rm(path.join(exportDirectoryPath, sheet.id), {
        recursive: true,
        force: true,
      });
    }

    // Randomly decide whether to shuffle creation timestamps before or after cast vote record
    // creation. If we always did one or the other, the last voter's cast vote record would be
    // identifiable, as either the first or the last cast vote record among the cluster of cast
    // vote records with the latest creation timestamps.
    const whenToShuffleRelativeToCastVoteRecordCreation = assertDefined(
      (['before', 'after'] as const)[crypto.randomInt(0, 2)]
    );
    if (
      isCreationTimestampShufflingNecessary &&
      whenToShuffleRelativeToCastVoteRecordCreation === 'before'
    ) {
      await randomlyUpdateCreationTimestamps(
        exportContext,
        exportDirectoryPathRelativeToUsbMountPoint
      );
    }

    let mostRecentlyCreatedSubDirectoryName: string | undefined;
    if (sheet.type === 'rejected') {
      const exportResult = await exportRejectedSheetToUsbDrive(
        exportContext,
        sheet,
        exportDirectoryPathRelativeToUsbMountPoint
      );
      /* istanbul ignore next: Hard to trigger without significant mocking */
      if (exportResult.isErr()) {
        return exportResult;
      }
      const { subDirectoryName } = exportResult.ok();
      mostRecentlyCreatedSubDirectoryName = subDirectoryName;
    } else {
      const exportResult = await exportCastVoteRecordFilesToUsbDrive(
        exportContext,
        sheet,
        exportDirectoryPathRelativeToUsbMountPoint
      );
      if (exportResult.isErr()) {
        return exportResult;
      }
      const { castVoteRecordId, castVoteRecordHash } = exportResult.ok();
      castVoteRecordHashes[castVoteRecordId] = castVoteRecordHash;
      mostRecentlyCreatedSubDirectoryName = castVoteRecordId;
    }

    if (
      isCreationTimestampShufflingNecessary &&
      whenToShuffleRelativeToCastVoteRecordCreation === 'after'
    ) {
      await randomlyUpdateCreationTimestamps(
        exportContext,
        exportDirectoryPathRelativeToUsbMountPoint,
        { subDirectoryNameToIgnore: mostRecentlyCreatedSubDirectoryName }
      );
    }
  }

  for (const [castVoteRecordId, castVoteRecordHash] of Object.entries(
    castVoteRecordHashes
  )) {
    scannerStore.updateCastVoteRecordHashes(
      castVoteRecordId,
      castVoteRecordHash
    );
  }
  const updatedCastVoteRecordRootHash =
    scannerStore.getCastVoteRecordRootHash();

  // As a final safeguard after a recovery export, confirm that the Merkle tree hash of cast vote
  // records on the USB drive matches that on the machine
  if (isRecoveryExport) {
    const recomputedUsbDriveCastVoteRecordRootHash =
      await computeCastVoteRecordRootHashFromScratch(exportDirectoryPath);
    if (
      recomputedUsbDriveCastVoteRecordRootHash !== updatedCastVoteRecordRootHash
    ) {
      return err({
        type: 'recovery-export-error',
        subType: 'hash-mismatch-after-recovery-export',
      });
    }
  }

  const exportMetadataFileResult = await exportMetadataFileToUsbDrive(
    exportContext,
    updatedCastVoteRecordRootHash,
    exportDirectoryPathRelativeToUsbMountPoint
  );
  /* istanbul ignore next: Hard to trigger without significant mocking */
  if (exportMetadataFileResult.isErr()) {
    return exportMetadataFileResult;
  }
  const { metadataFileContents } = exportMetadataFileResult.ok();

  const exportSignatureFileResult = await exportSignatureFileToUsbDrive(
    exportContext,
    metadataFileContents,
    exportDirectoryPathRelativeToUsbMountPoint
  );
  /* istanbul ignore next: Hard to trigger without significant mocking */
  if (exportSignatureFileResult.isErr()) {
    return exportSignatureFileResult;
  }

  if (scannerStore.scannerType === 'precinct') {
    assert(exportOptions.scannerType === 'precinct');
    if (exportOptions.isFullExport || exportOptions.isRecoveryExport) {
      /**
       * Perform the scanner store update before clearing the cache for
       * {@link doesUsbDriveRequireCastVoteRecordSync} because
       * {@link doesUsbDriveRequireCastVoteRecordSync} considers the state modified by the scanner
       * store update
       */
      scannerStore.deleteAllPendingContinuousExportOperations();
      clearDoesUsbDriveRequireCastVoteRecordSyncCachedResult();
    } else {
      for (const sheetId of sheetIds) {
        scannerStore.deletePendingContinuousExportOperation(sheetId);
      }
    }
  }

  return ok();
}

/**
 * Returns whether a USB drive is inserted and requires a cast vote record sync because the cast
 * vote records on it don't match the cast vote records on the scanner. Only relevant for scanners
 * that continuously export cast vote records.
 *
 * Because this function 1) requires reading data from the USB drive and 2) is polled by consumers,
 * we use a caching mechanism to avoid constantly reading from the USB drive. We recompute whenever
 * 1) the USB drive status changes (e.g. on insertion and removal) or 2) the cache is explicitly
 * cleared (e.g. after cast vote record export). A scanner reboot will also result in
 * recomputation.
 */
export async function doesUsbDriveRequireCastVoteRecordSync(
  scannerStore: PrecinctScannerStore,
  usbDriveStatus: UsbDriveStatus
): Promise<boolean> {
  if (
    doesUsbDriveRequireCastVoteRecordSyncCachedResult &&
    doesUsbDriveRequireCastVoteRecordSyncCachedResult.previousUsbDriveStatus
      .status === usbDriveStatus.status
  ) {
    return doesUsbDriveRequireCastVoteRecordSyncCachedResult.previousValue;
  }

  const value = await (async () => {
    if (!scannerStore.getIsContinuousExportEnabled()) {
      return false;
    }

    if (usbDriveStatus.status !== 'mounted') {
      return false;
    }
    const usbMountPoint = usbDriveStatus.mountPoint;

    const electionRecord = scannerStore.getElectionRecord();
    if (!electionRecord) {
      return false;
    }
    const { electionDefinition } = electionRecord;
    const pollsState = scannerStore.getPollsState();
    if (
      pollsState === 'polls_closed_initial' ||
      pollsState === 'polls_closed_final'
    ) {
      return false;
    }
    const ballotsCounted = scannerStore.getBallotsCounted();
    if (ballotsCounted === 0) {
      return false;
    }

    // A previous export operation may have failed midway
    if (scannerStore.getPendingContinuousExportOperations().length > 0) {
      return true;
    }

    const { election, ballotHash } = electionDefinition;
    const exportDirectoryName = scannerStore.getExportDirectoryName();
    if (!exportDirectoryName) {
      return true;
    }
    const exportDirectoryPath = path.join(
      usbMountPoint,
      generateElectionBasedSubfolderName(election, ballotHash),
      SCANNER_RESULTS_FOLDER,
      exportDirectoryName
    );
    const metadataResult =
      await readCastVoteRecordExportMetadata(exportDirectoryPath);
    if (metadataResult.isErr()) {
      return true;
    }
    const castVoteRecordExportMetadata = metadataResult.ok();
    if (
      castVoteRecordExportMetadata.castVoteRecordRootHash !==
      scannerStore.getCastVoteRecordRootHash()
    ) {
      return true;
    }

    return false;
  })();
  doesUsbDriveRequireCastVoteRecordSyncCachedResult = {
    previousUsbDriveStatus: usbDriveStatus,
    previousValue: value,
  };

  return value;
}
