/* istanbul ignore file */
import crypto from 'crypto';
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
  BallotPageLayout,
  BatchInfo,
  CastVoteRecordExportMetadata,
  CVR,
  ElectionDefinition,
  MarkThresholds,
  PollsState,
  unsafeParse,
} from '@votingworks/types';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  generateCastVoteRecordExportDirectoryName,
  generateElectionBasedSubfolderName,
  isFeatureFlagEnabled,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';

import { ExportDataError, Exporter } from '../exporter';
import { Usb as LegacyUsb } from '../mock_usb';
import { SCAN_ALLOWED_EXPORT_PATTERNS, VX_MACHINE_ID } from '../scan_globals';
import { buildCastVoteRecord as baseBuildCastVoteRecord } from './build_cast_vote_record';
import { buildCastVoteRecordReportMetadata as baseBuildCastVoteRecordReportMetadata } from './build_report_metadata';
import {
  CanonicalizedSheet,
  canonicalizeSheet,
  describeSheetValidationError,
} from './canonicalize';
import { readCastVoteRecordExportMetadata } from './import';
import { ResultSheet } from './legacy_export';
import { buildElectionOptionPositionMap } from './option_map';

type ExportCastVoteRecordsToUsbDriveError =
  | { type: 'invalid-sheet-found'; message: string }
  | ExportDataError;

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
}

interface PrecinctScannerOptions {
  scannerType: 'precinct';
  arePollsClosing?: boolean;
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
  resultSheet: ResultSheet,
  canonicalizedSheet: CanonicalizedSheet
): CVR.CVR {
  const { scannerState } = exportContext;
  const { electionDefinition, markThresholds } = scannerState;
  const { election, electionHash: electionId } = electionDefinition;
  const electionOptionPositionMap = buildElectionOptionPositionMap(election);
  const scannerId = VX_MACHINE_ID;

  const { id, batchId, indexInBatch } = resultSheet;
  const castVoteRecordId =
    (canonicalizedSheet.type === 'bmd' &&
      canonicalizedSheet.interpretation.ballotId) ||
    unsafeParse(BallotIdSchema, id);

  // BMD ballot
  if (canonicalizedSheet.type === 'bmd') {
    return baseBuildCastVoteRecord({
      ballotMarkingMode: 'machine',
      batchId,
      castVoteRecordId,
      election,
      electionId,
      electionOptionPositionMap,
      indexInBatch,
      interpretation: canonicalizedSheet.interpretation,
      scannerId,
    });
  }

  // HMPB ballot
  const [frontFileName, backFileName] = canonicalizedSheet.filenames;
  const [frontInterpretation, backInterpretation] =
    canonicalizedSheet.interpretation;
  const frontPage = {
    imageFileUri: `file:${path.basename(frontFileName)}`,
    interpretation: frontInterpretation,
  } as const;
  const backPage = {
    imageFileUri: `file:${path.basename(backFileName)}`,
    interpretation: backInterpretation,
  } as const;
  return baseBuildCastVoteRecord({
    ballotMarkingMode: 'hand',
    batchId,
    castVoteRecordId,
    definiteMarkThreshold: markThresholds.definite,
    disableOriginalSnapshots: isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.DISABLE_CVR_ORIGINAL_SNAPSHOTS
    ),
    election,
    electionId,
    electionOptionPositionMap,
    indexInBatch,
    pages: [frontPage, backPage],
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
  resultSheet: ResultSheet,
  exportDirectoryPathRelativeToUsbMountPoint: string
): Promise<
  Result<
    { castVoteRecordId: string; castVoteRecordHash: string },
    ExportCastVoteRecordsToUsbDriveError
  >
> {
  const { exporter } = exportContext;

  const canonicalizeSheetResult = canonicalizeSheet(
    resultSheet.interpretation,
    [resultSheet.frontImagePath, resultSheet.backImagePath]
  );
  if (canonicalizeSheetResult.isErr()) {
    return err({
      type: 'invalid-sheet-found',
      message: describeSheetValidationError(canonicalizeSheetResult.err()),
    });
  }
  const canonicalizedSheet = canonicalizeSheetResult.ok();

  const castVoteRecordReportMetadata = buildCastVoteRecordReportMetadata(
    exportContext,
    // Hide the time in the metadata for individual cast vote records so that we don't reveal the
    // order in which ballots were cast
    { hideTime: true }
  );
  const castVoteRecord = buildCastVoteRecord(
    exportContext,
    resultSheet,
    canonicalizedSheet
  );
  const castVoteRecordId = castVoteRecord.UniqueId;
  const castVoteRecordReport: CVR.CastVoteRecordReport = {
    ...castVoteRecordReportMetadata,
    CVR: [castVoteRecord],
  };

  const [frontImageFilePath, backImageFilePath] = canonicalizedSheet.filenames;
  const frontLayout: BallotPageLayout | undefined =
    canonicalizedSheet.type === 'hmpb'
      ? canonicalizedSheet.interpretation[0].layout
      : undefined;
  const backLayout: BallotPageLayout | undefined =
    canonicalizedSheet.type === 'hmpb'
      ? canonicalizedSheet.interpretation[0].layout
      : undefined;

  const castVoteRecordFilesToExport: ReadableFile[] = [
    readableFileFromData(
      'cast-vote-record-report.json',
      JSON.stringify(castVoteRecordReport)
    ),
    readableFileFromDisk(frontImageFilePath),
    readableFileFromDisk(backImageFilePath),
  ];
  if (frontLayout) {
    castVoteRecordFilesToExport.push(
      readableFileFromData(
        `${path.parse(frontImageFilePath).name}.layout.json`,
        JSON.stringify(frontLayout)
      )
    );
  }
  if (backLayout) {
    castVoteRecordFilesToExport.push(
      readableFileFromData(
        `${path.parse(backImageFilePath).name}.layout.json`,
        JSON.stringify(frontLayout)
      )
    );
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
    'metadata.json',
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
 * voter privacy, every time a ballot is cast, we randomly select 1 or 2 previously added cast vote
 * records and update their creation timestamps to the present. This approach is equivalent to
 * moving random ballots to the top of a stack every time a new ballot is added to the stack, a
 * kind of shuffling as we go.
 *
 * This shuffling is irrelevant for full exports, where we already iterate over cast vote records
 * in an order independent of creation timestamp.
 */
async function randomlyUpdateCreationTimestamps(
  exportContext: ExportContext,
  exportDirectoryPathRelativeToUsbMountPoint: string,
  options: { castVoteRecordIdToIgnore?: string } = {}
): Promise<void> {
  const { usbMountPoint } = exportContext;

  const exportDirectoryPath = path.join(
    usbMountPoint,
    exportDirectoryPathRelativeToUsbMountPoint
  );
  const castVoteRecordIds = (
    await fs.readdir(exportDirectoryPath, { withFileTypes: true })
  )
    .filter(
      (entry) =>
        entry.isDirectory() && entry.name !== options.castVoteRecordIdToIgnore
    )
    .map((entry) => entry.name);

  if (castVoteRecordIds.length === 0) {
    return;
  }

  const oneOrTwo = crypto.randomInt(1, 3);
  for (let i = 0; i < oneOrTwo; i += 1) {
    const randomCastVoteRecordId = assertDefined(
      castVoteRecordIds[crypto.randomInt(0, castVoteRecordIds.length)]
    );
    const castVoteRecordDirectoryPath = path.join(
      exportDirectoryPath,
      randomCastVoteRecordId
    );
    await updateCreationTimestampOfDirectoryAndChildrenFiles(
      castVoteRecordDirectoryPath
    );
  }
}

//
// Exported functions
//

/**
 * Exports cast vote records from a scanner to a USB drive. Supports both continuous and batch
 * export use cases.
 */
export async function exportCastVoteRecordsToUsbDrive(
  scannerStore: ScannerStore,
  usbDrive: UsbDrive | LegacyUsb,
  resultSheets: ResultSheet[] | Generator<ResultSheet>,
  exportOptions: ExportOptions
): Promise<Result<void, ExportCastVoteRecordsToUsbDriveError>> {
  let usbMountPoint: string | undefined;
  if ('getUsbDrives' in usbDrive) {
    usbMountPoint = (await usbDrive.getUsbDrives())[0]?.mountPoint;
  } else {
    const usbDriveStatus = await usbDrive.status();
    usbMountPoint =
      usbDriveStatus.status === 'mounted'
        ? usbDriveStatus.mountPoint
        : undefined;
  }
  assert(usbMountPoint !== undefined);
  const exportContext: ExportContext = {
    exporter: new Exporter({
      allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
      getUsbDrives:
        'getUsbDrives' in usbDrive
          ? usbDrive.getUsbDrives
          : async () => {
              const drive = await usbDrive.status();
              return drive.status === 'mounted' ? [drive] : [];
            },
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
  for (const resultSheet of resultSheets) {
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

    const exportCastVoteRecordFilesResult =
      await exportCastVoteRecordFilesToUsbDrive(
        exportContext,
        resultSheet,
        exportDirectoryPathRelativeToUsbMountPoint
      );
    if (exportCastVoteRecordFilesResult.isErr()) {
      return exportCastVoteRecordFilesResult;
    }
    const { castVoteRecordId, castVoteRecordHash } =
      exportCastVoteRecordFilesResult.ok();
    castVoteRecordHashes[castVoteRecordId] = castVoteRecordHash;

    if (
      isCreationTimestampShufflingNecessary &&
      whenToShuffleRelativeToCastVoteRecordCreation === 'after'
    ) {
      await randomlyUpdateCreationTimestamps(
        exportContext,
        exportDirectoryPathRelativeToUsbMountPoint,
        // Don't randomly select the cast vote record that was just created
        { castVoteRecordIdToIgnore: castVoteRecordId }
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

  clearDoesUsbDriveRequireCastVoteRecordSyncCachedResult();

  return ok();
}

/**
 * Returns whether a USB drive is inserted and requires a cast vote record sync because the cast
 * vote records on it don't match the cast vote records on the machine. Only relevant for machines
 * that continuously export cast vote records.
 *
 * Because this function 1) requires reading data from the USB drive and 2) is polled by consumers,
 * we use a caching mechanism to avoid constantly reading from the USB drive. We recompute whenever
 * 1) the USB drive status changes (e.g. on insertion and removal) or 2) the cache is explicitly
 * cleared (e.g. after cast vote record export).
 */
export async function doesUsbDriveRequireCastVoteRecordSync(
  scannerStore: ScannerStore & {
    getBallotsCounted: () => number;
    getExportDirectoryName: NonNullable<ScannerStore['getExportDirectoryName']>;
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
    const ballotsCounted = scannerStore.getBallotsCounted();
    if (ballotsCounted === 0) {
      return false;
    }
    const castVoteRecordRootHash = scannerStore.getCastVoteRecordRootHash();

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
