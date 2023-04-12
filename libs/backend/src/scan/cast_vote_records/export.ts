import {
  BallotIdSchema,
  BallotPageLayout,
  BallotPageMetadata,
  BatchInfo,
  CVR,
  Election,
  ElectionDefinition,
  Id,
  PageInterpretation,
  SheetOf,
  unsafeParse,
} from '@votingworks/types';
import { err, ok, Optional, Result } from '@votingworks/basics';
import { Readable } from 'stream';
import {
  CAST_VOTE_RECORD_REPORT_FILENAME,
  generateCastVoteRecordReportDirectoryName,
  generateElectionBasedSubfolderName,
  jsonStream,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import { basename, join, parse } from 'path';
import fs from 'fs';
import {
  describeSheetValidationError,
  canonicalizeSheet,
} from './canonicalize';
import { buildCastVoteRecord, hasWriteIns } from './build_cast_vote_record';
import { ExportDataError, Exporter } from '../../exporter';
import { getUsbDrives } from '../../get_usb_drives';
import { SCAN_ALLOWED_EXPORT_PATTERNS, VX_MACHINE_ID } from '../globals';
import { BallotPageLayoutsLookup, getBallotPageLayout } from './page_layouts';
import { buildCastVoteRecordReportMetadata } from './build_report_metadata';

/**
 * Properties of each sheet that are needed to generate a cast vote record
 * for that sheet.
 */
export interface ResultSheet {
  readonly id: Id;
  readonly batchId: Id;
  /**
   * `indexInBatch` only applies to the central scanner. It is required in cast
   * vote records per VVSG 2.0 1.1.5-G.7, but is not included for the precinct
   * scanner because that would compromise voter privacy.
   */
  readonly indexInBatch?: number;
  // TODO: remove once the deprecated CVR export is no longer using batchLabel
  readonly batchLabel?: string;
  readonly interpretation: SheetOf<PageInterpretation>;
  readonly frontNormalizedFilename: string;
  readonly backNormalizedFilename: string;
}

/**
 * In cast vote record exports, the subdirectory under which images are
 * stored.
 */
export const CVR_BALLOT_IMAGES_SUBDIRECTORY = 'ballot-images';

/**
 * In cast vote record exports, the subdirectory under which layouts are
 * stored.
 */
export const CVR_BALLOT_LAYOUTS_SUBDIRECTORY = 'ballot-layouts';

type ReportContext = 'backup' | 'report-only';

function getImageFileUri({
  reportContext,
  batchId,
  pageHasWriteIns,
  filename,
}: {
  reportContext: ReportContext;
  batchId: string;
  pageHasWriteIns: boolean;
  filename: string;
}): Optional<string> {
  if (reportContext === 'backup') {
    return `file:./${basename(filename)}`;
  }

  if (pageHasWriteIns) {
    return `file:./${CVR_BALLOT_IMAGES_SUBDIRECTORY}/${batchId}/${basename(
      filename
    )}`;
  }

  return undefined;
}

interface GetCastVoteRecordGeneratorParams {
  electionDefinition: ElectionDefinition;
  definiteMarkThreshold: number;
  resultSheetGenerator: Generator<ResultSheet>;
  ballotPageLayoutsLookup: BallotPageLayoutsLookup;
  reportContext: ReportContext;
}

/**
 * Error thrown if an invalid sheet is found when attempting to convert
 * sheets to cast vote records.
 */
export class InvalidSheetFoundError extends Error {}

/**
 * Generator for cast vote records in CDF format {@link CVR.CVR}. Used to
 * generate a full cast vote record report. Throws an error if it is not
 * possible to generate a cast vote record from a sheet.
 */
function* getCastVoteRecordGenerator({
  electionDefinition,
  definiteMarkThreshold,
  resultSheetGenerator,
  ballotPageLayoutsLookup,
  reportContext,
}: GetCastVoteRecordGeneratorParams): Generator<CVR.CVR> {
  const { electionHash, election } = electionDefinition;
  const electionId = electionHash;
  const scannerId = VX_MACHINE_ID;

  for (const {
    id,
    batchId,
    indexInBatch,
    interpretation: [sideOne, sideTwo],
    frontNormalizedFilename: sideOneFilename,
    backNormalizedFilename: sideTwoFilename,
  } of resultSheetGenerator) {
    const canonicalizationResult = canonicalizeSheet(
      [sideOne, sideTwo],
      [sideOneFilename, sideTwoFilename]
    );

    if (canonicalizationResult.isErr()) {
      throw new InvalidSheetFoundError(
        describeSheetValidationError(canonicalizationResult.err())
      );
    }

    const canonicalizedSheet = canonicalizationResult.ok();

    // Build BMD cast vote record. Use the ballot ID as the cast vote record ID
    // if available, otherwise the UUID from the scanner database.
    if (canonicalizedSheet.type === 'bmd') {
      yield buildCastVoteRecord({
        election,
        electionId,
        scannerId,
        castVoteRecordId:
          canonicalizedSheet.interpretation.ballotId ||
          unsafeParse(BallotIdSchema, id),
        batchId,
        indexInBatch,
        ballotMarkingMode: 'machine',
        interpretation: canonicalizedSheet.interpretation,
      });

      continue;
    }

    // Build the HMPB cast vote record. Include file references to images if
    // the image contains write-ins
    const [front, back] = canonicalizedSheet.interpretation;
    const [frontFilename, backFilename] = canonicalizedSheet.filenames;
    const frontHasWriteIns = hasWriteIns(front.votes);
    const backHasWriteIns = hasWriteIns(back.votes);

    yield buildCastVoteRecord({
      election,
      electionId,
      scannerId,
      castVoteRecordId: unsafeParse(BallotIdSchema, id),
      batchId,
      indexInBatch,
      ballotMarkingMode: 'hand',
      definiteMarkThreshold,
      pages: [
        {
          interpretation: front,
          imageFileUri: getImageFileUri({
            reportContext,
            batchId,
            pageHasWriteIns: frontHasWriteIns,
            filename: frontFilename,
          }),
        },
        {
          interpretation: back,
          imageFileUri: getImageFileUri({
            reportContext,
            batchId,
            pageHasWriteIns: backHasWriteIns,
            filename: backFilename,
          }),
        },
      ],
      ballotPageLayoutsLookup,
    });
  }
}

interface BuildCastVoteRecordReportMetadataParams
  extends GetCastVoteRecordGeneratorParams {
  isTestMode: boolean;
  batchInfo: BatchInfo[];
}

/**
 * Builds a cast vote record report {@link CVR.CastVoteRecordReport} and
 * returns it in the form of a readable stream. Will throw an error when
 * streamed if a sheet is invalid and a cast vote record cannot be created.
 */
export function getCastVoteRecordReportStream({
  electionDefinition,
  isTestMode,
  definiteMarkThreshold,
  resultSheetGenerator,
  ballotPageLayoutsLookup,
  batchInfo,
  reportContext,
}: BuildCastVoteRecordReportMetadataParams): NodeJS.ReadableStream {
  const { electionHash, election } = electionDefinition;
  const electionId = electionHash;
  const scannerId = VX_MACHINE_ID;

  const castVoteRecordGenerator = getCastVoteRecordGenerator({
    electionDefinition,
    definiteMarkThreshold,
    resultSheetGenerator,
    ballotPageLayoutsLookup,
    reportContext,
  });

  const castVoteRecordReportMetadata = buildCastVoteRecordReportMetadata({
    election,
    electionId,
    generatingDeviceId: scannerId,
    scannerIds: [scannerId],
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode,
    batchInfo,
  });

  return Readable.from(
    jsonStream<CVR.CastVoteRecordReport>({
      ...castVoteRecordReportMetadata,
      CVR: castVoteRecordGenerator,
    })
  );
}

async function exportPageImageAndLayoutToUsbDrive({
  exporter,
  bucket,
  imageFilename,
  computedLayout,
  ballotPageLayoutsLookup,
  ballotPageMetadata,
  election,
  batchId,
}: {
  exporter: Exporter;
  bucket: string;
  imageFilename: string;
  computedLayout?: BallotPageLayout;
  ballotPageLayoutsLookup: BallotPageLayoutsLookup;
  ballotPageMetadata: BallotPageMetadata;
  election: Election;
  batchId: string;
}): Promise<Result<void, ExportDataError>> {
  const layout =
    computedLayout ??
    getBallotPageLayout({
      ballotPageMetadata,
      ballotPageLayoutsLookup,
      election,
    });
  const exportImageResult = await exporter.exportDataToUsbDrive(
    bucket,
    join(CVR_BALLOT_IMAGES_SUBDIRECTORY, batchId, basename(imageFilename)),
    fs.createReadStream(imageFilename)
  );
  if (exportImageResult.isErr()) {
    return exportImageResult;
  }

  const layoutBasename = `${parse(imageFilename).name}.layout.json`;
  const exportLayoutResult = await exporter.exportDataToUsbDrive(
    bucket,
    join(CVR_BALLOT_LAYOUTS_SUBDIRECTORY, batchId, layoutBasename),
    JSON.stringify(layout, undefined, 2)
  );
  if (exportLayoutResult.isErr()) {
    return exportLayoutResult;
  }

  return ok();
}

interface ExportCastVoteRecordReportToUsbDriveParams
  extends Omit<
    BuildCastVoteRecordReportMetadataParams,
    'reportContext' | 'resultSheetGenerator'
  > {
  ballotsCounted: number;
  getResultSheetGenerator: () => Generator<ResultSheet>;
}

/**
 * Errors that can occur when attempting to export a cast vote record report
 * to a USB drive.
 */
export type ExportCastVoteRecordReportToUsbDriveError =
  | { type: 'invalid-sheet-found'; message: string }
  | ExportDataError;

/**
 * Exports a complete cast vote record report to an inserted and mounted USB
 * drive, including ballot images and layouts.
 */
export async function exportCastVoteRecordReportToUsbDrive({
  electionDefinition,
  isTestMode,
  ballotsCounted,
  getResultSheetGenerator,
  ballotPageLayoutsLookup,
  definiteMarkThreshold,
  batchInfo,
}: ExportCastVoteRecordReportToUsbDriveParams): Promise<
  Result<void, ExportCastVoteRecordReportToUsbDriveError>
> {
  const { electionHash, election } = electionDefinition;
  const exporter = new Exporter({
    allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
    getUsbDrives,
  });

  const reportDirectory = join(
    SCANNER_RESULTS_FOLDER,
    generateElectionBasedSubfolderName(election, electionHash),
    generateCastVoteRecordReportDirectoryName(
      VX_MACHINE_ID,
      ballotsCounted,
      isTestMode,
      new Date()
    )
  );

  const castVoteRecordReportStream = getCastVoteRecordReportStream({
    electionDefinition,
    isTestMode,
    resultSheetGenerator: getResultSheetGenerator(),
    ballotPageLayoutsLookup,
    definiteMarkThreshold,
    batchInfo,
    reportContext: 'report-only',
  });

  // it's possible the report generation throws an error due to an invalid
  // result sheet from the store, so wrap in a try-catch
  try {
    const exportReportResult = await exporter.exportDataToUsbDrive(
      reportDirectory,
      CAST_VOTE_RECORD_REPORT_FILENAME,
      castVoteRecordReportStream
    );

    if (exportReportResult.isErr()) {
      return exportReportResult;
    }
  } catch (error) {
    if (error instanceof InvalidSheetFoundError) {
      return err({ type: 'invalid-sheet-found', message: error.message });
    }

    // unknown error during report generation
    throw error;
  }

  for (const {
    batchId,
    interpretation: [sideOne, sideTwo],
    frontNormalizedFilename: sideOneFilename,
    backNormalizedFilename: sideTwoFilename,
  } of getResultSheetGenerator()) {
    const canonicalizationResult = canonicalizeSheet(
      [sideOne, sideTwo],
      [sideOneFilename, sideTwoFilename]
    );

    if (canonicalizationResult.isErr()) {
      return err({
        type: 'invalid-sheet-found',
        message: describeSheetValidationError(canonicalizationResult.err()),
      });
    }

    const canonicalizedSheet = canonicalizationResult.ok();

    // we are only including HMPB write-ins so skip BMD ballot images
    if (canonicalizedSheet.type === 'bmd') {
      continue;
    }

    const [front, back] = canonicalizedSheet.interpretation;
    const [frontFilename, backFilename] = canonicalizedSheet.filenames;

    const frontHasWriteIns = hasWriteIns(front.votes);
    const backHasWriteIns = hasWriteIns(back.votes);

    // Export front image and layout if front has write-ins
    if (frontHasWriteIns) {
      const exportFrontPageImageAndLayoutResult =
        await exportPageImageAndLayoutToUsbDrive({
          exporter,
          bucket: reportDirectory,
          imageFilename: frontFilename,
          computedLayout: front.layout,
          ballotPageMetadata: front.metadata,
          ballotPageLayoutsLookup,
          election,
          batchId,
        });
      if (exportFrontPageImageAndLayoutResult.isErr()) {
        return exportFrontPageImageAndLayoutResult;
      }
    }

    // Export back image and layout if back has write-ins
    if (backHasWriteIns) {
      const exportBackPageImageAndLayoutResult =
        await exportPageImageAndLayoutToUsbDrive({
          exporter,
          bucket: reportDirectory,
          imageFilename: backFilename,
          computedLayout: back.layout,
          ballotPageMetadata: back.metadata,
          ballotPageLayoutsLookup,
          election,
          batchId,
        });
      if (exportBackPageImageAndLayoutResult.isErr()) {
        return exportBackPageImageAndLayoutResult;
      }
    }
  }

  return ok();
}
