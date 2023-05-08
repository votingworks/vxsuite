import {
  BallotPaperSize,
  BallotType,
  CVR,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { assert, assertDefined, find, iter } from '@votingworks/basics';
import {
  buildCastVoteRecordReportMetadata,
  CVR_BALLOT_IMAGES_SUBDIRECTORY,
  CVR_BALLOT_LAYOUTS_SUBDIRECTORY,
} from '@votingworks/backend';
import * as fs from 'fs';
import yargs from 'yargs/yargs';
import {
  CAST_VOTE_RECORD_REPORT_FILENAME,
  jsonStream,
} from '@votingworks/utils';
import { writeImageData, createImageData } from '@votingworks/image-utils';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import cloneDeep from 'lodash.clonedeep';
import { generateBallotPageLayouts } from '@votingworks/converter-nh-accuvote';
import { generateCvrs } from '../../generate_cvrs';
import {
  generateBallotAssetPath,
  replaceUniqueId,
  IMAGE_URI_REGEX,
  getBatchIdForScannerId,
} from '../../utils';

/**
 * Script to generate a cast vote record file for a given election.
 * Run from the command-line with:
 *
 * ./bin/generate -h
 *
 * To see more information and all possible arguments.
 */

export const DEFAULT_SCANNER_ID = 'VX-00-000';

interface GenerateCvrFileArguments {
  electionDefinition?: string;
  outputPath?: string;
  numBallots?: number;
  scannerIds?: Array<string | number>;
  officialBallots: boolean;
  ballotIdPrefix?: string;
  help?: boolean;
  [x: string]: unknown;
}

interface IO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

/**
 * Command line interface for generating a cast vote record file.
 */
export async function main(
  argv: readonly string[],
  { stdout, stderr }: IO
): Promise<number> {
  let exitCode: number | undefined;
  const optionParser = yargs()
    .strict()
    .exitProcess(false)
    .options({
      electionDefinition: {
        type: 'string',
        alias: 'p',
        description: 'Path to the election definition.',
      },
      outputPath: {
        type: 'string',
        alias: 'o',
        description:
          'Path of directory to use as root of generated cast vote record output.',
      },
      numBallots: {
        type: 'number',
        description: 'Number of ballots to include in the output.',
      },
      officialBallots: {
        type: 'boolean',
        default: false,
        description:
          'Create live mode ballots when specified, by default test mode ballots are created.',
      },
      scannerIds: {
        type: 'array',
        description: 'Creates ballots for each scanner id specified.',
      },
      ballotIdPrefix: {
        type: 'string',
        description:
          'If included, applies a prefix to the ballot ids. E.g. "p-456" instead of "456"',
      },
    })
    .alias('-h', '--help')
    .help(false)
    .version(false)
    .fail((msg) => {
      stderr.write(`${msg}\n`);
      exitCode = 1;
    });

  const args = (await optionParser.parse(
    argv.slice(2)
  )) as GenerateCvrFileArguments;

  if (typeof exitCode !== 'undefined') {
    return exitCode;
  }

  if (args.help) {
    optionParser.showHelp((out) => {
      stdout.write(out);
      stdout.write('\n');
    });
    return 0;
  }

  if (!args.electionDefinition) {
    stderr.write('Missing election definition\n');
    return 1;
  }

  if (!args.outputPath) {
    stderr.write('Missing output path\n');
    return 1;
  }

  if (args.scannerIds && args.scannerIds.length < 1) {
    stderr.write(
      'Must specify at least one scanner id with --scannerIds option\n'
    );
    return 1;
  }

  const {
    outputPath,
    electionDefinition: electionDefinitionPath,
    ballotIdPrefix,
  } = args;
  const testMode = !args.officialBallots;

  const scannerIds = (args.scannerIds ?? [DEFAULT_SCANNER_ID]).map(
    (s) => `${s}`
  );

  const electionDefinition = safeParseElectionDefinition(
    fs.readFileSync(electionDefinitionPath).toString()
  ).unsafeUnwrap();

  const castVoteRecords = iter(
    generateCvrs({
      electionDefinition,
      testMode,
      scannerIds,
      ballotIdPrefix,
    })
  ).toArray();

  const uniqueCastVoteRecordCount = castVoteRecords.length;
  const numBallots = args.numBallots || uniqueCastVoteRecordCount;
  // Modify results to match the desired number of ballots
  if (numBallots < uniqueCastVoteRecordCount) {
    stderr.write(
      `WARNING: At least ${uniqueCastVoteRecordCount} are suggested to be generated for maximum coverage of ballot metadata options and possible contest votes.\n`
    );
    // Remove random entries from the CVR list until the desired number of ballots is reached
    while (numBallots < castVoteRecords.length) {
      const i = Math.floor(Math.random() * castVoteRecords.length);
      castVoteRecords.splice(i, 1);
    }
  }

  let ballotId = castVoteRecords.length;
  // Duplicate random ballots until the desired number of ballots is reached.
  while (numBallots > castVoteRecords.length) {
    const i = Math.floor(Math.random() * uniqueCastVoteRecordCount);
    const castVoteRecord = castVoteRecords[i];
    assert(castVoteRecord);

    // we need each cast vote record to have a unique id
    const newCastVoteRecord = replaceUniqueId(
      castVoteRecord,
      ballotIdPrefix ? `${ballotIdPrefix}-${ballotId}` : ballotId.toString()
    );

    // clone deep so jsonStream util will not detect circular references
    castVoteRecords.push(cloneDeep(newCastVoteRecord));
    ballotId += 1;
  }

  const { election, electionHash } = electionDefinition;
  const reportMetadata = buildCastVoteRecordReportMetadata({
    election,
    electionId: electionHash,
    generatingDeviceId: assertDefined(scannerIds[0]),
    scannerIds,
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode: testMode,
    batchInfo: scannerIds.map((scannerId) => ({
      id: getBatchIdForScannerId(scannerId),
      batchNumber: 1,
      label: getBatchIdForScannerId(scannerId),
      startedAt: new Date().toISOString(),
      count: castVoteRecords.length / scannerIds.length,
    })),
  });

  // make the parent folder if it does not exist
  fs.mkdirSync(outputPath, { recursive: true });

  const reportStream = jsonStream<CVR.CastVoteRecordReport>({
    ...reportMetadata,
    CVR: castVoteRecords,
  });

  // write the report
  await pipeline(
    reportStream,
    fs.createWriteStream(join(outputPath, CAST_VOTE_RECORD_REPORT_FILENAME))
  );

  if (election.gridLayouts) {
    // determine the images referenced in the report
    const imageUris = new Set<string>();
    for (const castVoteRecord of castVoteRecords) {
      const ballotImages = castVoteRecord.BallotImage;
      if (ballotImages) {
        if (ballotImages[0]?.Location) {
          imageUris.add(ballotImages[0]?.Location);
        }
        if (ballotImages[1]?.Location) {
          imageUris.add(ballotImages[1]?.Location);
        }
      }
    }

    // export information from the relevant ballot package entries
    for (const imageUri of imageUris) {
      const regexMatch = imageUri.match(IMAGE_URI_REGEX);
      // istanbul ignore next
      if (regexMatch === null) {
        throw new Error('unexpected file URI format');
      }
      const [, batchId, ballotStyleId, precinctId, pageNumberString] =
        regexMatch;
      assert(batchId !== undefined);
      assert(ballotStyleId !== undefined);
      assert(precinctId !== undefined);
      assert(pageNumberString !== undefined);
      // eslint-disable-next-line vx/gts-safe-number-parse
      const pageNumber = Number(pageNumberString);

      const pageDpi = 200;
      const pageWidthInches = 8.5;
      let pageHeightInches: number;

      switch (election.ballotLayout?.paperSize) {
        case BallotPaperSize.Legal:
          pageHeightInches = 14;
          break;

        case BallotPaperSize.Custom8Point5X17:
          pageHeightInches = 17;
          break;

        case BallotPaperSize.Letter:
        default:
          pageHeightInches = 11;
          break;
      }

      // create directories for assets
      fs.mkdirSync(
        join(outputPath, `${CVR_BALLOT_IMAGES_SUBDIRECTORY}/${batchId}`),
        { recursive: true }
      );
      fs.mkdirSync(
        join(outputPath, `${CVR_BALLOT_LAYOUTS_SUBDIRECTORY}/${batchId}`),
        { recursive: true }
      );

      // write the image
      await writeImageData(
        join(
          outputPath,
          generateBallotAssetPath({
            ballotStyleId,
            batchId,
            precinctId,
            pageNumber,
            assetType: 'image',
          })
        ),
        createImageData(
          new Uint8ClampedArray(
            pageWidthInches * pageDpi * (pageHeightInches * pageDpi) * 4
          ),
          pageWidthInches * pageDpi,
          pageHeightInches * pageDpi
        )
      );

      // write the layout
      const layout = find(
        generateBallotPageLayouts(election, {
          ballotStyleId,
          precinctId,
          electionHash,
          ballotType: BallotType.Standard,
          locales: { primary: 'en-US' },
          isTestMode: testMode,
        }).unsafeUnwrap(),
        (l) => l.metadata.pageNumber === pageNumber
      );
      fs.writeFileSync(
        join(
          outputPath,
          generateBallotAssetPath({
            ballotStyleId,
            batchId,
            precinctId,
            pageNumber,
            assetType: 'layout',
          })
        ),
        `${JSON.stringify(layout, undefined, 2)}\n`
      );
    }
  }

  stdout.write(
    `Wrote ${castVoteRecords.length} cast vote records to ${outputPath}\n`
  );

  return 0;
}
