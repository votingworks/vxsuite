import { buildCastVoteRecordReportMetadata } from '@votingworks/backend';
import { assert, iter } from '@votingworks/basics';
import { CVR } from '@votingworks/types';
import {
  CAST_VOTE_RECORD_REPORT_FILENAME,
  jsonStream,
  readBallotPackageFromBuffer,
} from '@votingworks/utils';
import * as fs from 'fs';
import cloneDeep from 'lodash.clonedeep';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import yargs from 'yargs/yargs';
import { generateCvrs } from '../../generate_cvrs';
import { replaceUniqueId } from '../../utils';

/**
 * Script to generate a cast vote record file for a given election.
 * Run from the command-line with:
 *
 * ./bin/generate -h
 *
 * To see more information and all possible arguments.
 */

interface GenerateCvrFileArguments {
  ballotPackage?: string;
  outputPath?: string;
  numBallots?: number;
  scannerNames?: Array<string | number>;
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
      scannerNames: {
        type: 'array',
        description: 'Creates ballots for each scanner name specified.',
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

  if (!args.ballotPackage) {
    stderr.write('Missing ballot package\n');
    return 1;
  }

  if (!args.outputPath) {
    stderr.write('Missing output path\n');
    return 1;
  }

  const { outputPath, ballotPackage: ballotPackagePath, ballotIdPrefix } = args;
  const scannerNames = (args.scannerNames ?? ['scanner']).map((s) => `${s}`);
  const testMode = !args.officialBallots;

  const ballotPackage = await readBallotPackageFromBuffer(
    fs.readFileSync(ballotPackagePath)
  );
  const { electionDefinition } = ballotPackage;

  const castVoteRecords = iter(
    generateCvrs({
      ballotPackage,
      scannerNames,
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
    generatingDeviceId: scannerNames?.[0] || 'scanner',
    scannerIds: scannerNames || ['scanner'],
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode: testMode,
    batchInfo: [
      {
        id: 'batch-1',
        batchNumber: 1,
        label: 'Batch 1',
        startedAt: new Date().toISOString(),
        count: castVoteRecords.length,
      },
    ],
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

  stdout.write(
    `Wrote ${castVoteRecords.length} cast vote records to ${outputPath}\n`
  );

  return 0;
}
