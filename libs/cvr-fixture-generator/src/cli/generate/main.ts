import { CVR } from '@votingworks/types';
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
  readBallotPackageFromBuffer,
} from '@votingworks/utils';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import cloneDeep from 'lodash.clonedeep';
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
  ballotPackage?: string;
  outputPath?: string;
  numBallots?: number;
  scannerIds?: Array<string | number>;
  officialBallots: boolean;
  includeBallotImages: boolean;
  ballotIdPrefix?: string;
  bmdBallots: boolean;
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
      ballotPackage: {
        type: 'string',
        alias: 'p',
        description: 'Path to the election ballot package.',
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
      includeBallotImages: {
        type: 'boolean',
        description:
          'Whether to include ballot images with write-in ballots in the output.',
      },
      ballotIdPrefix: {
        type: 'string',
        description:
          'If included, applies a prefix to the ballot ids. E.g. "p-456" instead of "456"',
      },
      bmdBallots: {
        type: 'boolean',
        description:
          'Create BMD ballots when specified. By default HMPB ballots are created. Note that this will create ballots without images, regardless of the "includeBallotImages" argument',
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

  if (!args.ballotPackage) {
    stderr.write('Missing ballot package\n');
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
    includeBallotImages,
    ballotPackage: ballotPackagePath,
    ballotIdPrefix,
    bmdBallots,
  } = args;
  const testMode = !args.officialBallots;

  const scannerIds = (args.scannerIds ?? [DEFAULT_SCANNER_ID]).map(
    (s) => `${s}`
  );

  const ballotPackage = await readBallotPackageFromBuffer(
    fs.readFileSync(ballotPackagePath)
  );
  const { electionDefinition } = ballotPackage;

  const castVoteRecords = iter(
    generateCvrs({
      ballotPackage,
      includeBallotImages,
      testMode,
      scannerIds,
      ballotIdPrefix,
      bmdBallots,
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

  if (includeBallotImages) {
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

      const ballotPackageEntry = find(
        ballotPackage.ballots,
        (ballot) =>
          ballot.ballotConfig.ballotStyleId === ballotStyleId &&
          ballot.ballotConfig.precinctId === precinctId &&
          ballot.ballotConfig.isLiveMode === !testMode
      );

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
      for await (const { page, pageNumber: pdfPageNumber } of pdfToImages(
        ballotPackageEntry.pdf
      )) {
        if (pdfPageNumber === pageNumber) {
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
            page
          );
        }
      }

      // write the layout
      const layout = ballotPackageEntry.layout[pageNumber - 1];
      assert(layout);
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
