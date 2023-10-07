/* istanbul ignore file */
import crypto from 'crypto';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import {
  computeSingleCastVoteRecordHash,
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
  CVR,
  ElectionDefinition,
  ExportCastVoteRecordsToUsbDriveError,
  Id,
  MarkThresholds,
  PageInterpretation,
  PollsState,
  SheetOf,
  unsafeParse,
} from '@votingworks/types';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  generateCastVoteRecordExportDirectoryName,
  generateElectionBasedSubfolderName,
  getCastVoteRecordExportSubDirectoryNames,
  hasWriteIns,
  isFeatureFlagEnabled,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';

import { Exporter } from '../exporter';
import { SCAN_ALLOWED_EXPORT_PATTERNS, VX_MACHINE_ID } from '../scan_globals';
import { buildCastVoteRecord as baseBuildCastVoteRecord } from './build_cast_vote_record';
import { buildCastVoteRecordReportMetadata as baseBuildCastVoteRecordReportMetadata } from './build_report_metadata';
import { CanonicalizedSheet, canonicalizeSheet } from './canonicalize';
import {
  CastVoteRecordReportWithoutMetadata,
  readCastVoteRecordExportMetadata,
} from './import';
import { buildElectionOptionPositionMap } from './option_map';

/**
 * The subset of scanner store methods relevant to exporting cast vote records
 */
export interface ScannerStore {
  clearCastVoteRecordHashes(): void;
  getBatches(): BatchInfo[];
  getCastVoteRecordRootHash(): string;
  getElectionDefinition(): ElectionDefinition | undefined;
  getMarkThresholds(): MarkThresholds;
  getTestMode(): boolean;
  updateCastVoteRecordHashes(
    castVoteRecordId: string,
    castVoteRecordHash: string
  ): void;

  getExportDirectoryName?(): string | undefined;
  getPollsState?(): PollsState;
  setExportDirectoryName?(exportDirectoryName: string): void;
}

/**
 * State that can be retrieved via the ScannerStore interface and that is unchanged by exporting
 * cast vote records
 */
interface ScannerStateUnchangedByExport {
  batches: BatchInfo[];
  electionDefinition: ElectionDefinition;
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
}

type ExportOptions = CentralScannerOptions | PrecinctScannerOptions;

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
  readonly interpretation: SheetOf<PageInterpretation>;
  readonly frontImagePath: string;
  readonly backImagePath: string;

  /**
   * Required per VVSG 2.0 1.1.5-G.7 but only relevant for central scanners. On precinct scanners,
   * this would compromise voter privacy.
   */
  readonly indexInBatch?: number;

  /**
   * TODO: Determine whether this field is still used and, if not, remove
   */
  readonly batchLabel?: string;
}

/**
 * A scanned sheet that was rejected
 */
export interface RejectedSheet {
  readonly type: 'rejected';
  readonly id: Id;
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
function clearDoesUsbDriveRequireCastVoteRecordSyncCachedResult(): void {
  doesUsbDriveRequireCastVoteRecordSyncCachedResult = undefined;
}

function isMinimalExport(exportOptions: ExportOptions): boolean {
  return Boolean(
    exportOptions.scannerType === 'central' && exportOptions.isMinimalExport
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
  exportContext: ExportContext
): Promise<string> {
  const { exportOptions, scannerState, scannerStore, usbMountPoint } =
    exportContext;
  const { electionDefinition, inTestMode } = scannerState;
  const { election, electionHash } = electionDefinition;

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
      assert(scannerStore.getExportDirectoryName !== undefined);
      assert(scannerStore.setExportDirectoryName !== undefined);
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
    SCANNER_RESULTS_FOLDER,
    generateElectionBasedSubfolderName(election, electionHash),
    exportDirectoryName
  );
  await fs.mkdir(
    path.join(usbMountPoint, exportDirectoryPathRelativeToUsbMountPoint),
    { recursive: true }
  );
  return exportDirectoryPathRelativeToUsbMountPoint;
}

function buildCastVoteRecordReportMetadata(
  exportContext: ExportContext,
  options: { hideTime?: boolean } = {}
): CVR.CastVoteRecordReport {
  const { scannerState } = exportContext;
  const { batches, electionDefinition, inTestMode } = scannerState;
  const { election, electionHash: electionId } = electionDefinition;
  const scannerId = VX_MACHINE_ID;

  return baseBuildCastVoteRecordReportMetadata({
    batchInfo: batches,
    election,
    electionId,
    generatedDate: options.hideTime ? new Date(election.date) : undefined,
    generatingDeviceId: scannerId,
    isTestMode: inTestMode,
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    scannerIds: [scannerId],
  });
}

function buildCastVoteRecord(
  exportContext: ExportContext,
  sheet: AcceptedSheet,
  canonicalizedSheet: CanonicalizedSheet,
  options: { shouldIncludeImageReferences?: boolean } = {}
): CVR.CVR {
  const { scannerState } = exportContext;
  const { electionDefinition, markThresholds } = scannerState;
  const { election, electionHash: electionId } = electionDefinition;
  const electionOptionPositionMap = buildElectionOptionPositionMap(election);
  const scannerId = VX_MACHINE_ID;

  const { id, batchId, indexInBatch } = sheet;
  const castVoteRecordId =
    (canonicalizedSheet.type === 'bmd' &&
      canonicalizedSheet.interpretation.ballotId) ||
    unsafeParse(BallotIdSchema, id);
  const [frontImageFilePath, backImageFilePath] = canonicalizedSheet.filenames;
  const imageFileUris: SheetOf<string> | undefined =
    options.shouldIncludeImageReferences
      ? [
          `file:${path.basename(frontImageFilePath)}`,
          `file:${path.basename(backImageFilePath)}`,
        ]
      : undefined;

  // BMD ballot
  if (canonicalizedSheet.type === 'bmd') {
    return baseBuildCastVoteRecord({
      ballotMarkingMode: 'machine',
      batchId,
      castVoteRecordId,
      election,
      electionId,
      electionOptionPositionMap,
      imageFileUris,
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
    castVoteRecordId,
    definiteMarkThreshold: markThresholds.definite,
    election,
    electionId,
    electionOptionPositionMap,
    excludeOriginalSnapshots: isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.CAST_VOTE_RECORD_OPTIMIZATION_EXCLUDE_ORIGINAL_SNAPSHOTS
    ),
    imageFileUris,
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
    ? canonicalizedSheet.type === 'hmpb' &&
      canonicalizedSheet.interpretation.some(({ votes }) => hasWriteIns(votes))
    : true;

  const castVoteRecordReportMetadata = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.CAST_VOTE_RECORD_OPTIMIZATION_EXCLUDE_REDUNDANT_METADATA
  )
    ? undefined
    : buildCastVoteRecordReportMetadata(
        exportContext,
        // Hide the time in the metadata for individual cast vote records so that we don't reveal the
        // order in which ballots were cast
        { hideTime: true }
      );
  const castVoteRecord = buildCastVoteRecord(
    exportContext,
    sheet,
    canonicalizedSheet,
    { shouldIncludeImageReferences: shouldIncludeImages }
  );
  const castVoteRecordId = castVoteRecord.UniqueId;
  const castVoteRecordReport:
    | CVR.CastVoteRecordReport
    | CastVoteRecordReportWithoutMetadata = {
    ...(castVoteRecordReportMetadata ?? {}),
    CVR: [castVoteRecord],
  };

  const castVoteRecordFilesToExport: ReadableFile[] = [
    readableFileFromData(
      CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT,
      JSON.stringify(castVoteRecordReport)
    ),
  ];

  if (shouldIncludeImages) {
    const [frontImageFilePath, backImageFilePath] =
      canonicalizedSheet.filenames;
    castVoteRecordFilesToExport.push(readableFileFromDisk(frontImageFilePath));
    castVoteRecordFilesToExport.push(readableFileFromDisk(backImageFilePath));

    if (canonicalizedSheet.type === 'hmpb') {
      const [frontInterpretation, backInterpretation] =
        canonicalizedSheet.interpretation;
      castVoteRecordFilesToExport.push(
        readableFileFromData(
          `${path.parse(frontImageFilePath).name}.layout.json`,
          JSON.stringify(frontInterpretation.layout)
        )
      );
      castVoteRecordFilesToExport.push(
        readableFileFromData(
          `${path.parse(backImageFilePath).name}.layout.json`,
          JSON.stringify(backInterpretation.layout)
        )
      );
    }
  }

  for (const file of castVoteRecordFilesToExport) {
    const exportResult = await exporter.exportDataToUsbDrive(
      exportDirectoryPathRelativeToUsbMountPoint,
      path.join(castVoteRecordId, file.fileName),
      file.open()
    );
    if (exportResult.isErr()) {
      return exportResult;
    }
  }

  const castVoteRecordHash = await computeSingleCastVoteRecordHash({
    directoryName: castVoteRecordId,
    files: castVoteRecordFilesToExport,
  });

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
  };
  const metadataFileContents = JSON.stringify(metadata);

  const exportResult = await exporter.exportDataToUsbDrive(
    exportDirectoryPathRelativeToUsbMountPoint,
    CastVoteRecordExportFileName.METADATA,
    metadataFileContents
  );
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
  if (exportResult.isErr()) {
    return exportResult;
  }

  return ok();
}

/**
 * Updates the creation timestamp of a directory and its children files (assuming no
 * sub-directories) using the one method guaranteed to work:
 * ```
 * cp -r <directory-path> <directory-path>-temp
 * rm -r <directory-path>
 * mv <directory-path>-temp <directory-path>
 * ```
 *
 * Doesn't use fs.cp(src, dest, { recursive: true }) under the hood because fs.cp is still
 * experimental.
 */
export async function updateCreationTimestampOfDirectoryAndChildrenFiles(
  directoryPath: string
): Promise<void> {
  await fs.mkdir(`${directoryPath}-temp`);
  const fileNames = (
    await fs.readdir(directoryPath, { withFileTypes: true })
  ).map((entry) => {
    assert(
      entry.isFile(),
      `Unexpected sub-directory ${entry.name} in ${directoryPath}`
    );
    return entry.name;
  });
  for (const fileName of fileNames) {
    await fs.copyFile(
      path.join(directoryPath, fileName),
      path.join(`${directoryPath}-temp`, fileName)
    );
  }
  // In case the system loses power while deleting the original directory, mark the copied
  // directory as complete to facilitate recovery on reboot. On reboot, if we see a *-temp
  // directory, we can safely delete it, and if we see a *-temp-complete directory, we can safely
  // delete the original directory and move the *-temp-complete directory to the original path.
  await fs.rename(`${directoryPath}-temp`, `${directoryPath}-temp-complete`);
  await fs.rm(directoryPath, { recursive: true });
  await fs.rename(`${directoryPath}-temp-complete`, directoryPath);
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

function getCastVoteRecordExportInProgressMarkerFilePath(
  usbMountPoint: string
): string {
  return path.join(usbMountPoint, '.vx-export-in-progress');
}

async function markCastVoteRecordExportAsInProgress(
  usbMountPoint: string
): Promise<void> {
  await fs.writeFile(
    getCastVoteRecordExportInProgressMarkerFilePath(usbMountPoint),
    ''
  );
}

async function markCastVoteRecordExportAsComplete(
  usbMountPoint: string
): Promise<void> {
  await fs.rm(getCastVoteRecordExportInProgressMarkerFilePath(usbMountPoint), {
    force: true,
  });
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
  const usbDriveStatus = await usbDrive.status();
  const usbMountPoint =
    usbDriveStatus.status === 'mounted' ? usbDriveStatus.mountPoint : undefined;
  if (usbMountPoint === undefined) {
    return err({ type: 'missing-usb-drive' });
  }
  const exportContext: ExportContext = {
    exporter: new Exporter({
      allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
      usbDrive,
    }),
    exportOptions,
    scannerState: {
      batches: scannerStore.getBatches(),
      electionDefinition: assertDefined(scannerStore.getElectionDefinition()),
      inTestMode: scannerStore.getTestMode(),
      markThresholds: scannerStore.getMarkThresholds(),
      pollsState: scannerStore.getPollsState?.(),
    },
    scannerStore,
    usbMountPoint,
  };

  await markCastVoteRecordExportAsInProgress(usbMountPoint);

  // Before a full export, clear cast vote record hashes so that they can be recomputed from
  // scratch. This is particularly important for VxCentralScan, where batches can be deleted
  // between exports.
  if (exportOptions.scannerType === 'central' || exportOptions.isFullExport) {
    scannerStore.clearCastVoteRecordHashes();
  }

  const exportDirectoryPathRelativeToUsbMountPoint =
    await getExportDirectoryPathRelativeToUsbMountPoint(exportContext);

  const isCreationTimestampShufflingNecessary =
    exportOptions.scannerType === 'precinct' && !exportOptions.isFullExport;

  const castVoteRecordHashes: { [castVoteRecordId: string]: string } = {};
  for (const sheet of sheets) {
    assert(
      !(isMinimalExport(exportOptions) && sheet.type === 'rejected'),
      'Encountered an unexpected rejected sheet while performing a minimal export. ' +
        'Minimal exports should only include accepted sheets.'
    );

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

  const exportMetadataFileResult = await exportMetadataFileToUsbDrive(
    exportContext,
    updatedCastVoteRecordRootHash,
    exportDirectoryPathRelativeToUsbMountPoint
  );
  if (exportMetadataFileResult.isErr()) {
    return exportMetadataFileResult;
  }
  const { metadataFileContents } = exportMetadataFileResult.ok();

  const exportSignatureFileResult = await exportSignatureFileToUsbDrive(
    exportContext,
    metadataFileContents,
    exportDirectoryPathRelativeToUsbMountPoint
  );
  if (exportSignatureFileResult.isErr()) {
    return exportSignatureFileResult;
  }

  await markCastVoteRecordExportAsComplete(usbMountPoint);
  clearDoesUsbDriveRequireCastVoteRecordSyncCachedResult();

  return ok();
}

/**
 * Checks whether cast vote records are being exported to a USB drive (or were being exported
 * to the USB drive before it was last removed)
 */
export function areOrWereCastVoteRecordsBeingExportedToUsbDrive(
  usbDriveStatus: UsbDriveStatus
): boolean {
  if (usbDriveStatus.status !== 'mounted') {
    return false;
  }
  return existsSync(
    getCastVoteRecordExportInProgressMarkerFilePath(usbDriveStatus.mountPoint)
  );
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
  scannerStore: ScannerStore & {
    getBallotsCounted: () => number;
    getExportDirectoryName: NonNullable<ScannerStore['getExportDirectoryName']>;
    getPollsState: NonNullable<ScannerStore['getPollsState']>;
  },
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
    if (usbDriveStatus.status !== 'mounted') {
      return false;
    }
    const usbMountPoint = usbDriveStatus.mountPoint;

    const electionDefinition = scannerStore.getElectionDefinition();
    if (!electionDefinition) {
      return false;
    }
    const exportDirectoryName = scannerStore.getExportDirectoryName();
    if (!exportDirectoryName) {
      return false;
    }
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
    const castVoteRecordRootHash = scannerStore.getCastVoteRecordRootHash();

    // A previous export operation may have failed midway
    if (areOrWereCastVoteRecordsBeingExportedToUsbDrive(usbDriveStatus)) {
      return true;
    }

    const { election, electionHash } = electionDefinition;
    const exportDirectoryPath = path.join(
      usbMountPoint,
      SCANNER_RESULTS_FOLDER,
      generateElectionBasedSubfolderName(election, electionHash),
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
      castVoteRecordRootHash
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
