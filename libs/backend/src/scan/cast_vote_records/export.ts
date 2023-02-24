import {
  BallotIdSchema,
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

/**
 * Combines the report metadata and an array of cast vote records into a
 * consumable readable stream representing the entire, saturated report.
 */
function streamifyCastVoteRecordReport({
  castVoteRecordReportMetadata,
  castVoteRecords,
}: {
  castVoteRecordReportMetadata: CVR.CastVoteRecordReport;
  castVoteRecords: CVR.CVR[];
}): NodeJS.ReadableStream {
  if (castVoteRecordReportMetadata.CVR) {
    throw new Error('report metadata should contain no cast vote records');
  }

  function* reportGenerator() {
    yield JSON.stringify(castVoteRecordReportMetadata, undefined, 2).replace(
      /\n\}$/,
      ',\n  "CVR": ['
    );

    for (const [index, castVoteRecord] of castVoteRecords.entries()) {
      if (index < castVoteRecords.length - 1) {
        yield `\n    ${JSON.stringify(castVoteRecord)},`;
      } else {
        yield `\n    ${JSON.stringify(castVoteRecord)}`;
      }
    }

    yield '\n  ]\n}';
  }

  return Readable.from(reportGenerator());
}

/**
 * Error that can occur when generating the cast vote record report. Currently
 * the only possible error is a sheet that fails to pass validation.
 */
export interface BuildCastVoteRecordReportError {
  type: 'invalid-sheet-found';
  message: string;
}

interface CastVoteRecordReportImageOptions {
  which: 'all' | 'write-ins';
  directory: string;
}

interface BuildCastVoteRecordReportParams {
  electionDefinition: ElectionDefinition;
  isTestMode: boolean;
  definiteMarkThreshold: number;
  resultSheetGenerator: () => Generator<ResultSheet>;
  ballotPageLayoutsLookup: BallotPageLayoutsLookup;
  batchInfo: BatchInfo[];
  imageOptions: CastVoteRecordReportImageOptions;
}

/**
 * Builds a cast vote record report {@link CVR.CastVoteRecordReport} and
 * returns it in the form of a readable stream. If it's necessary to do
 * particular export operations on each sheet, you may pass in a
 * `sheetExportCallback`.
 */
export function buildCastVoteRecordReport({
  electionDefinition,
  isTestMode,
  definiteMarkThreshold,
  resultSheetGenerator,
  ballotPageLayoutsLookup,
  batchInfo,
  imageOptions,
}: BuildCastVoteRecordReportParams): Result<
  NodeJS.ReadableStream,
  BuildCastVoteRecordReportError
> {
  const { electionHash, election } = electionDefinition;
  const electionId = electionHash;
  const scannerId = VX_MACHINE_ID;

  const castVoteRecords: CVR.CVR[] = [];

  for (const {
    id,
    batchId,
    interpretation: [sideOne, sideTwo],
    frontNormalizedFilename: sideOneFilename,
    backNormalizedFilename: sideTwoFilename,
  } of resultSheetGenerator()) {
    const canonicalizationResult = canonicalizeSheet([sideOne, sideTwo]);

    if (canonicalizationResult.isErr()) {
      return err({
        type: 'invalid-sheet-found',
        message: describeSheetValidationError(canonicalizationResult.err()),
      });
    }

    const canonicalizedSheet = canonicalizationResult.ok();
    const [frontFilename, backFilename] = canonicalizedSheet.wasReversed
      ? [sideTwoFilename, sideOneFilename]
      : [sideOneFilename, sideTwoFilename];

    // Build BMD cast vote record. Use the ballot ID as the cast vote record ID
    // if available, otherwise the UUID from the scanner database.
    if (canonicalizedSheet.type === 'bmd') {
      castVoteRecords.push(
        buildCastVoteRecord({
          election,
          electionId,
          scannerId,
          castVoteRecordId:
            canonicalizedSheet.interpretation.ballotId ||
            unsafeParse(BallotIdSchema, id),
          batchId,
          ballotMarkingMode: 'machine',
          interpretation: canonicalizedSheet.interpretation,
        })
      );

      continue;
    }

    // Build the HMPB cast vote record
    const [front, back] = canonicalizedSheet.interpretation;
    const frontHasWriteIns = hasWriteIns(front.votes);
    const backHasWriteIns = hasWriteIns(back.votes);

    // Build the HMPB cast vote record
    castVoteRecords.push(
      buildCastVoteRecord({
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
      })
    );
  }

  const castVoteRecordReportMetadata = buildCastVoteRecordReportMetadata({
    election,
    electionId,
    generatingDeviceId: scannerId,
    scannerIds: [scannerId],
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode,
    batchInfo,
  });

  return ok(
    streamifyCastVoteRecordReport({
      castVoteRecordReportMetadata,
      castVoteRecords,
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
  extends Omit<BuildCastVoteRecordReportParams, 'imageOptions'> {
  ballotsCounted: number;
}

/**
 * Errors that can occur when attempting to export a cast vote record report
 * to a USB drive.
 */
export type ExportCastVoteRecordReportToUsbDriveError =
  | BuildCastVoteRecordReportError
  | ExportDataError;

/**
 * Exports a complete cast vote record report to an inserted and mounted USB
 * drive, including ballot images and layouts.
 */
export async function exportCastVoteRecordReportToUsbDrive({
  electionDefinition,
  isTestMode,
  ballotsCounted,
  resultSheetGenerator,
  ballotPageLayoutsLookup,
  definiteMarkThreshold,
  batchInfo,
}: ExportCastVoteRecordReportToUsbDriveParams): Promise<
  Result<void, BuildCastVoteRecordReportError | ExportDataError>
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

  const buildCastVoteRecordReportResult = buildCastVoteRecordReport({
    electionDefinition,
    isTestMode,
    resultSheetGenerator,
    ballotPageLayoutsLookup,
    definiteMarkThreshold,
    batchInfo,
    imageOptions: {
      which: 'write-ins',
      directory: CVR_BALLOT_IMAGES_SUBDIRECTORY,
    },
  });

  if (buildCastVoteRecordReportResult.isErr()) {
    return buildCastVoteRecordReportResult;
  }

  const castVoteRecordReport = buildCastVoteRecordReportResult.ok();

  const exportReportResult = await exporter.exportDataToUsbDrive(
    reportDirectory,
    'report.json',
    castVoteRecordReport
  );

  if (exportReportResult.isErr()) {
    return exportReportResult;
  }

  for (const {
    interpretation: [sideOne, sideTwo],
    frontNormalizedFilename: sideOneFilename,
    backNormalizedFilename: sideTwoFilename,
  } of resultSheetGenerator()) {
    const canonicalizationResult = canonicalizeSheet([sideOne, sideTwo]);

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
    const [frontFilename, backFilename] = canonicalizedSheet.wasReversed
      ? [sideTwoFilename, sideOneFilename]
      : [sideOneFilename, sideTwoFilename];

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
