import {
  BallotIdSchema,
  BallotPageMetadata,
  BatchInfo,
  CVR,
  Election,
  ElectionDefinition,
  Id,
  Optional,
  PageInterpretation,
  SheetOf,
  unsafeParse,
} from '@votingworks/types';
import { err, ok, Result } from '@votingworks/basics';
import { Readable } from 'stream';
import {
  generateCastVoteRecordReportDirectoryName,
  generateElectionBasedSubfolderName,
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
  // TODO: remove once the deprecated CVR export is no longer using batchLabel
  readonly batchLabel?: string;
  readonly interpretation: SheetOf<PageInterpretation>;
  readonly frontNormalizedFilename: string;
  readonly backNormalizedFilename: string;
}

interface CastVoteRecordReportImageOptions {
  which: 'all' | 'write-ins';
  directory: string;
}

interface GetCastVoteRecordGeneratorParams {
  electionDefinition: ElectionDefinition;
  definiteMarkThreshold: number;
  resultSheetGenerator: Generator<ResultSheet>;
  ballotPageLayoutsLookup: BallotPageLayoutsLookup;
  imageOptions: CastVoteRecordReportImageOptions;
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
  imageOptions,
}: GetCastVoteRecordGeneratorParams): Generator<CVR.CVR> {
  const { electionHash, election } = electionDefinition;
  const electionId = electionHash;
  const scannerId = VX_MACHINE_ID;

  for (const {
    id,
    batchId,
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
      ballotMarkingMode: 'hand',
      definiteMarkThreshold,
      pages: [
        {
          interpretation: front,
          imageFileUri:
            imageOptions.which === 'all' ||
            (imageOptions.which === 'write-ins' && frontHasWriteIns)
              ? `file:./${imageOptions.directory}/${basename(frontFilename)}`
              : undefined,
        },
        {
          interpretation: back,
          imageFileUri:
            imageOptions.which === 'all' ||
            (imageOptions.which === 'write-ins' && backHasWriteIns)
              ? `file:./${imageOptions.directory}/${basename(backFilename)}`
              : undefined,
        },
      ],
      ballotPageLayoutsLookup,
    });
  }
}

/**
 * Combines the report metadata and a cast vote record generator string
 * generator which yields the entire contents of the report.
 */
function* getCastVoteRecordReportGenerator({
  castVoteRecordReportMetadata,
  castVoteRecordGenerator,
}: {
  castVoteRecordReportMetadata: CVR.CastVoteRecordReport;
  castVoteRecordGenerator: Generator<CVR.CVR>;
}): Generator<string> {
  if (castVoteRecordReportMetadata.CVR) {
    throw new Error('report metadata should contain no cast vote records');
  }

  // report metadata, with unclosed JSON to append cast vote records
  yield JSON.stringify(castVoteRecordReportMetadata, undefined, 2).replace(
    /\n\}$/,
    ',\n  "CVR": ['
  );

  // we don't know how many cast vote records there are until they are
  // generated, but we must identify the last element to avoid a trailing
  // comma, which would create invalid JSON.
  let previousCastVoteRecord: Optional<CVR.CVR>;
  for (const castVoteRecord of castVoteRecordGenerator) {
    // yield non-final elements with trailing comma
    if (previousCastVoteRecord) {
      yield `\n    ${JSON.stringify(previousCastVoteRecord)},`;
    }
    previousCastVoteRecord = castVoteRecord;
  }

  // yield final element without trailing comma
  if (previousCastVoteRecord) {
    yield `\n    ${JSON.stringify(previousCastVoteRecord)}\n  `;
  }

  // closing brackets to make JSON valid
  yield ']\n}';
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
  imageOptions,
}: BuildCastVoteRecordReportMetadataParams): NodeJS.ReadableStream {
  const { electionHash, election } = electionDefinition;
  const electionId = electionHash;
  const scannerId = VX_MACHINE_ID;

  const castVoteRecordGenerator = getCastVoteRecordGenerator({
    electionDefinition,
    definiteMarkThreshold,
    resultSheetGenerator,
    ballotPageLayoutsLookup,
    imageOptions,
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
    getCastVoteRecordReportGenerator({
      castVoteRecordReportMetadata,
      castVoteRecordGenerator,
    })
  );
}

const CVR_BALLOT_IMAGES_SUBDIRECTORY = 'ballot-images';
const CVR_BALLOT_LAYOUTS_SUBDIRECTORY = 'ballot-layouts';

async function exportPageImageAndLayoutToUsbDrive({
  exporter,
  bucket,
  imageFilename,
  ballotPageLayoutsLookup,
  ballotPageMetadata,
  election,
}: {
  exporter: Exporter;
  bucket: string;
  imageFilename: string;
  ballotPageLayoutsLookup: BallotPageLayoutsLookup;
  ballotPageMetadata: BallotPageMetadata;
  election: Election;
}): Promise<Result<void, ExportDataError>> {
  const layout = getBallotPageLayout({
    ballotPageMetadata,
    ballotPageLayoutsLookup,
    election,
  });
  const exportImageResult = await exporter.exportDataToUsbDrive(
    bucket,
    join(CVR_BALLOT_IMAGES_SUBDIRECTORY, basename(imageFilename)),
    fs.createReadStream(imageFilename)
  );
  if (exportImageResult.isErr()) {
    return exportImageResult;
  }

  const layoutBasename = `${parse(imageFilename).name}.layout.json`;
  const exportLayoutResult = await exporter.exportDataToUsbDrive(
    bucket,
    join(CVR_BALLOT_LAYOUTS_SUBDIRECTORY, layoutBasename),
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
    'imageOptions' | 'resultSheetGenerator'
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
    imageOptions: {
      which: 'write-ins',
      directory: CVR_BALLOT_IMAGES_SUBDIRECTORY,
    },
  });

  // it's possible the report generation throws an error due to an invalid
  // result sheet from the store, so wrap in a try-catch
  try {
    const exportReportResult = await exporter.exportDataToUsbDrive(
      reportDirectory,
      'report.json',
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
          ballotPageMetadata: front.metadata,
          ballotPageLayoutsLookup,
          election,
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
          ballotPageMetadata: back.metadata,
          ballotPageLayoutsLookup,
          election,
        });
      if (exportBackPageImageAndLayoutResult.isErr()) {
        return exportBackPageImageAndLayoutResult;
      }
    }
  }

  return ok();
}
