import {
  BallotIdSchema,
  BatchInfo,
  CVR,
  Election,
  Id,
  Optional,
  PageInterpretation,
  SheetOf,
  unsafeParse,
} from '@votingworks/types';
import { mapAsync, ok, Result } from '@votingworks/basics';
import { Readable } from 'stream';
import {
  generateCastVoteRecordReportFilename,
  generateElectionBasedSubfolderName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import { basename, join } from 'path';
import {
  describeSheetValidationError,
  validateSheetInterpretation,
} from './validation';
import { buildCastVoteRecord, hasWriteIns } from './build_cast_vote_record';
import { ExportDataError, Exporter } from '../../exporter';
import { getUsbDrives } from '../../get_usb_drives';
import { SCAN_ALLOWED_EXPORT_PATTERNS, VX_MACHINE_ID } from '../globals';
import { BallotPageLayoutsLookup } from './page_layouts';
import { buildCastVoteRecordReport } from './build_report_metadata';
import { getInlineBallotImage } from './get_inline_ballot_image';

interface CastVoteRecordReportImageOptions {
  imagesDirectory: string;
  includedImageFileUris: 'none' | 'write-ins' | 'all';
  // TODO: Remove option. Currently only applies to write-ins
  includeInlineBallotImages: boolean;
}

/**
 * Properties of each sheet that are needed to generate a cast vote record
 * for that sheet.
 */
export interface ResultSheet {
  readonly id: Id;
  readonly batchId: Id;
  readonly batchLabel?: string;
  readonly interpretation: SheetOf<PageInterpretation>;
  readonly frontNormalizedFilename: string;
  readonly backNormalizedFilename: string;
}

interface GetCastVoteRecordGeneratorParams {
  election: Election;
  electionId: string;
  scannerId: string;
  definiteMarkThreshold: number;
  ballotPageLayoutsLookup: BallotPageLayoutsLookup;
  resultSheetGenerator: Generator<ResultSheet>;
  imageOptions: CastVoteRecordReportImageOptions;
}

async function* getCastVoteRecordGenerator({
  election,
  electionId,
  scannerId,
  definiteMarkThreshold,
  ballotPageLayoutsLookup,
  resultSheetGenerator,
  imageOptions,
}: GetCastVoteRecordGeneratorParams): AsyncGenerator<CVR.CVR> {
  for (const {
    id,
    batchId,
    interpretation: [sideOne, sideTwo],
    frontNormalizedFilename: sideOneFilename,
    backNormalizedFilename: sideTwoFilename,
  } of resultSheetGenerator) {
    const validationResult = validateSheetInterpretation([sideOne, sideTwo]);

    if (validationResult.isErr()) {
      throw new Error(describeSheetValidationError(validationResult.err()));
    }

    const validatedSheet = validationResult.ok();

    // Build BMD cast vote record. For the ID, we use the ballot ID if available,
    // otherwise the UUID from the scanner database.
    if (validatedSheet.type === 'bmd') {
      yield buildCastVoteRecord({
        election,
        electionId,
        scannerId,
        castVoteRecordId:
          validatedSheet.interpretation.ballotId ||
          unsafeParse(BallotIdSchema, id),
        batchId,
        ballotMarkingMode: 'machine',
        interpretation: validatedSheet.interpretation,
      });
    } else {
      const [front, back] = validatedSheet.interpretation;
      const [frontFilename, backFilename] = validatedSheet.wasReversed
        ? [sideTwoFilename, sideOneFilename]
        : [sideOneFilename, sideTwoFilename];

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
            inlineBallotImage:
              frontHasWriteIns && imageOptions.includeInlineBallotImages
                ? await getInlineBallotImage(frontFilename)
                : undefined,
            imageFileUri:
              imageOptions.includedImageFileUris === 'all' ||
              (imageOptions.includedImageFileUris === 'write-ins' &&
                frontHasWriteIns)
                ? `file:./${imageOptions.imagesDirectory}/${basename(
                    frontFilename
                  )}`
                : undefined,
          },
          {
            interpretation: back,
            inlineBallotImage:
              backHasWriteIns && imageOptions.includeInlineBallotImages
                ? await getInlineBallotImage(backFilename)
                : undefined,
            imageFileUri:
              imageOptions.includedImageFileUris === 'all' ||
              (imageOptions.includedImageFileUris === 'write-ins' &&
                backHasWriteIns)
                ? `file:./${imageOptions.imagesDirectory}/${basename(
                    backFilename
                  )}`
                : undefined,
          },
        ],
        ballotPageLayoutsLookup,
      });
    }
  }
}

async function* concatStreams(readables: NodeJS.ReadableStream[]) {
  for (const readable of readables) {
    for await (const chunk of readable) {
      yield chunk;
    }
  }
}

/**
 * JSON format requires that we have no trailing commas, so we must
 * post-process the cast vote records iterator to add a comma after all but
 * the last.
 */
async function* commaSeparateStringGenerator(
  asyncGenerator: AsyncGenerator<string>
): AsyncGenerator<string> {
  let previous: Optional<string>;
  for await (const current of asyncGenerator) {
    if (previous) {
      yield `${previous},`;
    }
    previous = current;
  }

  // yield last element without trailing comma
  if (previous) {
    yield previous;
  }
}

interface GetCastVoteRecordReportStreamParams
  extends GetCastVoteRecordGeneratorParams {
  isTestMode: boolean;
  batchInfo: BatchInfo[];
}

/**
 * Returns a readable stream consisting of a cast vote record report.
 */
export function getCastVoteRecordReportStream({
  election,
  electionId,
  scannerId,
  definiteMarkThreshold,
  isTestMode,
  ballotPageLayoutsLookup,
  resultSheetGenerator,
  batchInfo,
  imageOptions,
}: GetCastVoteRecordReportStreamParams): NodeJS.ReadableStream {
  const castVoteRecordGenerator = getCastVoteRecordGenerator({
    election,
    electionId,
    scannerId,
    definiteMarkThreshold,
    ballotPageLayoutsLookup,
    resultSheetGenerator,
    imageOptions,
  });
  const reportMetadata = buildCastVoteRecordReport({
    election,
    electionId,
    generatingDeviceId: scannerId,
    scannerIds: [scannerId],
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode,
    batchInfo,
  });

  const reportMetadataJson = JSON.stringify(reportMetadata, undefined, 2);

  const reportMetadataStream = Readable.from(
    reportMetadataJson.replace(/\n\}$/, ',\n  "CVR": [')
  );

  const cvrStream = Readable.from(
    commaSeparateStringGenerator(
      mapAsync(castVoteRecordGenerator, (cvr) => `\n    ${JSON.stringify(cvr)}`)
    )
  );

  const closingStream = Readable.from('  ]\n}');

  return Readable.from(
    concatStreams([reportMetadataStream, cvrStream, closingStream])
  );
}

interface ExportCastVoteRecordReportToUsbDriveParams {
  electionHash: string;
  ballotsCounted: number;
  election: Election;
  definiteMarkThreshold: number;
  ballotPageLayoutsLookup: BallotPageLayoutsLookup;
  resultSheetGenerator: Generator<ResultSheet>;
  isTestMode: boolean;
  batchInfo: BatchInfo[];
  imageOptions: CastVoteRecordReportImageOptions;
}

/**
 * Exports a CDF cast vote record report to an inserted and mounted USB drive
 */
export async function exportCastVoteRecordReportToUsbDrive({
  election,
  electionHash,
  isTestMode,
  ballotsCounted,
  ...rest
}: ExportCastVoteRecordReportToUsbDriveParams): Promise<
  Result<void, ExportDataError>
> {
  const cvrFilename = generateCastVoteRecordReportFilename(
    VX_MACHINE_ID,
    ballotsCounted,
    isTestMode,
    new Date()
  );
  const electionFolderName = generateElectionBasedSubfolderName(
    election,
    electionHash
  );

  const exporter = new Exporter({
    allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
    getUsbDrives,
  });
  const result = await exporter.exportDataToUsbDrive(
    SCANNER_RESULTS_FOLDER,
    join(electionFolderName, cvrFilename),
    getCastVoteRecordReportStream({
      election,
      electionId: electionHash,
      scannerId: VX_MACHINE_ID,
      isTestMode,
      ...rest,
    })
  );
  if (result.isErr()) {
    return result;
  }

  return ok();
}
