/* istanbul ignore file */
import { Buffer } from 'buffer';
import fs from 'fs/promises';
import { sha256 } from 'js-sha256';
import path from 'path';
import { Readable } from 'stream';
import { ArtifactAuthenticatorApi } from '@votingworks/auth';
import { assertDefined, err, ok, Result } from '@votingworks/basics';
import {
  BallotIdSchema,
  BallotPageLayout,
  BatchInfo,
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
import { buildCastVoteRecord } from './build_cast_vote_record';
import { buildCastVoteRecordReportMetadata } from './build_report_metadata';
import {
  CanonicalizedSheet,
  canonicalizeSheet,
  describeSheetValidationError,
} from './canonicalize';
import { ResultSheet } from './export';
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

interface File {
  fileName: string;
  fileContents: string | Buffer;
}

/**
 * Metadata stored in the top-level metadata file for a cast vote record export
 */
interface CastVoteRecordExportMetadata {
  arePollsClosed?: boolean;
  /** Global data relevant to all cast vote records in an export, e.g. election info */
  castVoteRecordReportMetadata: CVR.CastVoteRecordReport;
  /** A hash of all cast vote record files in an export */
  castVoteRecordRootHash: string;
}

/**
 * The API for a cast vote record exporter that a scanner can use to export cast vote records.
 * Supports both continuous and batch export use cases.
 */
export interface CastVoteRecordExporterApi {
  exportCastVoteRecordsToUsbDrive(
    resultSheets: ResultSheet[] | Generator<ResultSheet>
  ): Promise<Result<void, ExportCastVoteRecordToUsbDriveError>>;
}

/**
 * The implementation of the cast vote record exporter API
 */
export class CastVoteRecordExporter implements CastVoteRecordExporterApi {
  private readonly artifactAuthenticator: ArtifactAuthenticatorApi;
  private readonly exporter: Exporter;
  private readonly scannerStore: ScannerStore;
  private readonly usbDrive: UsbDrive;

  constructor(input: {
    artifactAuthenticator: ArtifactAuthenticatorApi;
    scannerStore: ScannerStore;
    usbDrive: UsbDrive;
  }) {
    this.artifactAuthenticator = input.artifactAuthenticator;
    this.scannerStore = input.scannerStore;
    this.usbDrive = input.usbDrive;

    this.exporter = new Exporter({
      allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
      getUsbDrives: async () => {
        const drive = await this.usbDrive.status();
        return drive.status === 'mounted' ? [drive] : [];
      },
    });
  }

  async exportCastVoteRecordsToUsbDrive(
    resultSheets: ResultSheet[] | Generator<ResultSheet>
  ): Promise<Result<void, ExportCastVoteRecordToUsbDriveError>> {
    const scannerState = this.getScannerState();

    const exportDirectoryPathRelativeToUsbMountPoint =
      this.getExportDirectoryPathRelativeToUsbMountPoint(scannerState);

    for (const resultSheet of resultSheets) {
      const exportCastVoteRecordFilesResult =
        await this.exportCastVoteRecordFilesToUsbDrive(
          scannerState,
          resultSheet,
          exportDirectoryPathRelativeToUsbMountPoint
        );
      if (exportCastVoteRecordFilesResult.isErr()) {
        return exportCastVoteRecordFilesResult;
      }
    }

    const exportMetadataFileResult = await this.exportMetadataFileToUsbDrive(
      scannerState,
      this.buildCastVoteRecordReportMetadata(scannerState),
      exportDirectoryPathRelativeToUsbMountPoint
    );
    if (exportMetadataFileResult.isErr()) {
      return exportMetadataFileResult;
    }

    return ok();
  }

  private getScannerState(): ScannerStateUnchangedByExport {
    return {
      batches: this.scannerStore.getBatches(),
      electionDefinition: assertDefined(
        this.scannerStore.getElectionDefinition()
      ),
      inTestMode: this.scannerStore.getTestMode(),
      markThresholds: this.scannerStore.getMarkThresholds(),
      pollsState: this.scannerStore.getPollsState(),
    };
  }

  private getExportDirectoryPathRelativeToUsbMountPoint(
    scannerState: ScannerStateUnchangedByExport
  ): string {
    const { electionDefinition, inTestMode } = scannerState;
    const { election, electionHash } = electionDefinition;

    let exportDirectoryName = this.scannerStore.getExportDirectoryName();
    if (!exportDirectoryName) {
      // Create a new export directory if necessary
      exportDirectoryName = generateCastVoteRecordExportDirectoryName({
        inTestMode,
        machineId: VX_MACHINE_ID,
      });
      this.scannerStore.setExportDirectoryName(exportDirectoryName);
    }
    return path.join(
      SCANNER_RESULTS_FOLDER,
      generateElectionBasedSubfolderName(election, electionHash),
      exportDirectoryName
    );
  }

  /**
   * Exports the following for a single cast vote record:
   * - The cast vote record report (JSON)
   * - The front image (JPEG)
   * - The back image (JPEG)
   * - If an HMPB, the front interpretation layout (JSON)
   * - If an HMPB, the back interpretation layout (JSON)
   *
   * Also updates the hashes in the scanner's cast vote record hashes table.
   */
  private async exportCastVoteRecordFilesToUsbDrive(
    scannerState: ScannerStateUnchangedByExport,
    resultSheet: ResultSheet,
    exportDirectoryPathRelativeToUsbMountPoint: string
  ): Promise<Result<void, ExportCastVoteRecordToUsbDriveError>> {
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
      this.buildCastVoteRecordReportMetadata(scannerState);
    const castVoteRecord = this.buildCastVoteRecord(
      scannerState,
      resultSheet,
      canonicalizedSheet
    );
    const castVoteRecordId = castVoteRecord.UniqueId;
    const castVoteRecordReport: CVR.CastVoteRecordReport = {
      ...castVoteRecordReportMetadata,
      CVR: [castVoteRecord],
    };

    const [frontImageFilePath, backImageFilePath] =
      canonicalizedSheet.filenames;
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
      const exportResult = await this.exporter.exportDataToUsbDrive(
        exportDirectoryPathRelativeToUsbMountPoint,
        path.join(castVoteRecordId, fileName),
        Buffer.isBuffer(fileContents)
          ? Readable.from(fileContents)
          : fileContents
      );
      if (exportResult.isErr()) {
        return exportResult;
      }
    }

    this.updateCastVoteRecordHashes(
      castVoteRecordId,
      castVoteRecordFilesToExport
    );

    return ok();
  }

  /**
   * Exports a top-level metadata file for a cast vote record export
   */
  private async exportMetadataFileToUsbDrive(
    scannerState: ScannerStateUnchangedByExport,
    castVoteRecordReportMetadata: CVR.CastVoteRecordReport,
    exportDirectoryPathRelativeToUsbMountPoint: string
  ): Promise<Result<void, ExportCastVoteRecordToUsbDriveError>> {
    const { pollsState } = scannerState;

    const metadata: CastVoteRecordExportMetadata = {
      arePollsClosed: pollsState
        ? pollsState === 'polls_closed_final'
        : undefined, // Irrelevant for VxCentralScan
      castVoteRecordReportMetadata,
      castVoteRecordRootHash: this.scannerStore.getCastVoteRecordRootHash(),
    };

    const exportResult = await this.exporter.exportDataToUsbDrive(
      exportDirectoryPathRelativeToUsbMountPoint,
      'metadata.json',
      JSON.stringify(metadata)
    );
    if (exportResult.isErr()) {
      return exportResult;
    }

    // TODO: Sign metadata file

    return ok();
  }

  private buildCastVoteRecordReportMetadata(
    scannerState: ScannerStateUnchangedByExport
  ): CVR.CastVoteRecordReport {
    const { batches, electionDefinition, inTestMode } = scannerState;
    const { election, electionHash: electionId } = electionDefinition;
    const scannerId = VX_MACHINE_ID;

    return buildCastVoteRecordReportMetadata({
      batchInfo: batches,
      election,
      electionId,
      generatingDeviceId: scannerId,
      isTestMode: inTestMode,
      reportTypes: [CVR.ReportType.OriginatingDeviceExport],
      scannerIds: [scannerId],
    });
  }

  private buildCastVoteRecord(
    scannerState: ScannerStateUnchangedByExport,
    resultSheet: ResultSheet,
    canonicalizedSheet: CanonicalizedSheet
  ): CVR.CVR {
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
      return buildCastVoteRecord({
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
    return buildCastVoteRecord({
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

  private updateCastVoteRecordHashes(
    castVoteRecordId: string,
    castVoteRecordFilesToExport: File[]
  ) {
    const fileHashes = [...castVoteRecordFilesToExport]
      .sort((f1, f2) => (f1 && f2 ? f1.fileName.localeCompare(f2.fileName) : 0))
      .map(({ fileContents }) => sha256(fileContents));
    const castVoteRecordHash = sha256(fileHashes.join(''));
    this.scannerStore.updateCastVoteRecordHashes(
      castVoteRecordId,
      castVoteRecordHash
    );
  }
}
