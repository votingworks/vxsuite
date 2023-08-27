/* istanbul ignore file */
import { Buffer } from 'buffer';
import fs from 'fs/promises';
import { sha256 } from 'js-sha256';
import path from 'path';
import { Readable } from 'stream';
import { prepareSignatureFile } from '@votingworks/auth';
import { assertDefined, err, ok, Result } from '@votingworks/basics';
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
import { UsbDrive } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  generateCastVoteRecordExportDirectoryName,
  generateElectionBasedSubfolderName,
  isFeatureFlagEnabled,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';

import { ExportDataError, Exporter } from '../../exporter';
import { SCAN_ALLOWED_EXPORT_PATTERNS, VX_MACHINE_ID } from '../globals';
import { buildCastVoteRecord as baseBuildCastVoteRecord } from './build_cast_vote_record';
import { buildCastVoteRecordReportMetadata as baseBuildCastVoteRecordReportMetadata } from './build_report_metadata';
import {
  CanonicalizedSheet,
  canonicalizeSheet,
  describeSheetValidationError,
} from './canonicalize';
import { ResultSheet } from './legacy_export';
import { buildElectionOptionPositionMap } from './option_map';

type ExportCastVoteRecordToUsbDriveError =
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
  getExportDirectoryName(): string | undefined;
  getMarkThresholds(): MarkThresholds;
  getPollsState(): PollsState | undefined;
  getTestMode(): boolean;
  updateCastVoteRecordHashes(
    castVoteRecordId: string,
    castVoteRecordHash: string
  ): void;
  setExportDirectoryName(exportDirectoryName: string): void;
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

/**
 * A grouping of inputs needed by helpers throughout this file
 */
interface ExportContext {
  exporter: Exporter;
  scannerState: ScannerStateUnchangedByExport;
  scannerStore: ScannerStore;
}

interface File {
  fileName: string;
  fileContents: string | Buffer;
}

//
// Helpers
//

function getExportDirectoryPathRelativeToUsbMountPoint(
  exportContext: ExportContext
): string {
  const { scannerState, scannerStore } = exportContext;
  const { electionDefinition, inTestMode } = scannerState;
  const { election, electionHash } = electionDefinition;

  let exportDirectoryName = scannerStore.getExportDirectoryName();
  if (!exportDirectoryName) {
    // Create a new export directory if necessary
    exportDirectoryName = generateCastVoteRecordExportDirectoryName({
      inTestMode,
      machineId: VX_MACHINE_ID,
    });
    scannerStore.setExportDirectoryName(exportDirectoryName);
  }
  return path.join(
    SCANNER_RESULTS_FOLDER,
    generateElectionBasedSubfolderName(election, electionHash),
    exportDirectoryName
  );
}

function buildCastVoteRecordReportMetadata(
  exportContext: ExportContext
): CVR.CastVoteRecordReport {
  const { scannerState } = exportContext;
  const { batches, electionDefinition, inTestMode } = scannerState;
  const { election, electionHash: electionId } = electionDefinition;
  const scannerId = VX_MACHINE_ID;

  return baseBuildCastVoteRecordReportMetadata({
    batchInfo: batches,
    election,
    electionId,
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
    ExportCastVoteRecordToUsbDriveError
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

  const castVoteRecordReportMetadata =
    buildCastVoteRecordReportMetadata(exportContext);
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

  const castVoteRecordFilesToExport: File[] = [
    {
      fileName: 'cast-vote-record-report.json',
      fileContents: JSON.stringify(castVoteRecordReport),
    },
    {
      fileName: path.basename(frontImageFilePath),
      fileContents: await fs.readFile(frontImageFilePath),
    },
    {
      fileName: path.basename(backImageFilePath),
      fileContents: await fs.readFile(backImageFilePath),
    },
  ];
  if (frontLayout) {
    castVoteRecordFilesToExport.push({
      fileName: `${path.parse(frontImageFilePath).name}.layout.json`,
      fileContents: JSON.stringify(frontLayout),
    });
  }
  if (backLayout) {
    castVoteRecordFilesToExport.push({
      fileName: `${path.parse(backImageFilePath).name}.layout.json`,
      fileContents: JSON.stringify(frontLayout),
    });
  }

  for (const { fileName, fileContents } of castVoteRecordFilesToExport) {
    const exportResult = await exporter.exportDataToUsbDrive(
      exportDirectoryPathRelativeToUsbMountPoint,
      path.join(castVoteRecordId, fileName),
      Buffer.isBuffer(fileContents) ? Readable.from(fileContents) : fileContents
    );
    if (exportResult.isErr()) {
      return exportResult;
    }
  }

  const fileHashes = [...castVoteRecordFilesToExport]
    .sort((f1, f2) => (f1 && f2 ? f1.fileName.localeCompare(f2.fileName) : 0))
    .map(({ fileContents }) => sha256(fileContents));
  const castVoteRecordHash = sha256(fileHashes.join(''));

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
  Result<{ metadataFileContents: string }, ExportCastVoteRecordToUsbDriveError>
> {
  const { exporter, scannerState } = exportContext;
  const { pollsState } = scannerState;

  const metadata: CastVoteRecordExportMetadata = {
    arePollsClosed: pollsState
      ? pollsState === 'polls_closed_final'
      : undefined, // Irrelevant for VxCentralScan
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
): Promise<Result<void, ExportCastVoteRecordToUsbDriveError>> {
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

//
// Exported functions
//

/**
 * Exports cast vote records from a scanner to a USB drive. Supports both continuous and batch
 * export use cases.
 */
export async function exportCastVoteRecordsToUsbDrive(
  scannerStore: ScannerStore,
  usbDrive: UsbDrive,
  resultSheets: ResultSheet[] | Generator<ResultSheet>
): Promise<Result<void, ExportCastVoteRecordToUsbDriveError>> {
  const exportContext: ExportContext = {
    exporter: new Exporter({
      allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
      getUsbDrives: async () => {
        const drive = await usbDrive.status();
        return drive.status === 'mounted' ? [drive] : [];
      },
    }),
    scannerState: {
      batches: scannerStore.getBatches(),
      electionDefinition: assertDefined(scannerStore.getElectionDefinition()),
      inTestMode: scannerStore.getTestMode(),
      markThresholds: scannerStore.getMarkThresholds(),
      pollsState: scannerStore.getPollsState(),
    },
    scannerStore,
  };

  const exportDirectoryPathRelativeToUsbMountPoint =
    getExportDirectoryPathRelativeToUsbMountPoint(exportContext);

  for (const resultSheet of resultSheets) {
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

  return ok();
}
