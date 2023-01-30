import {
  BallotIdSchema,
  CastVoteRecord,
  unsafeParse,
} from '@votingworks/types';
import { takeAsync } from '@votingworks/basics';
import { readBallotPackageFromBuffer } from '@votingworks/utils';
import * as fs from 'fs';
import yargs from 'yargs/yargs';
import { generateCvrs, IncludeBallotImagesOption } from '../../generate_cvrs';

/**
 * Script to generate a cast vote record file for a given election.
 * Run from the command-line with:
 *
 * ./bin/generate-sample-cvr-file -h
 *
 * To see more information and all possible arguments.
 */

interface GenerateCvrFileArguments {
  ballotPackage?: string;
  outputPath?: string;
  numBallots?: number;
  scannerNames?: Array<string | number>;
  liveBallots: boolean;
  includeBallotImages: IncludeBallotImagesOption;
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
        description: 'Path to write output file to.',
      },
      numBallots: {
        type: 'number',
        description: 'Number of ballots to include in the output.',
      },
      liveBallots: {
        type: 'boolean',
        default: false,
        description:
          'Create live mode ballots when specified, by default test mode ballots are created.',
      },
      scannerNames: {
        type: 'array',
        description: 'Creates ballots for each scanner name specified.',
      },
      includeBallotImages: {
        choices: ['always', 'never', 'write-ins'] as const,
        description: 'When to include ballot images in the output.',
        default: 'never',
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

  const { outputPath, numBallots } = args;
  const testMode = !args.liveBallots;
  const scannerNames = (args.scannerNames ?? ['scanner']).map((s) => `${s}`);
  const { includeBallotImages } = args;

  const ballotPackage = await readBallotPackageFromBuffer(
    fs.readFileSync(args.ballotPackage)
  );

  const castVoteRecords = await takeAsync(
    Infinity,
    generateCvrs({ ballotPackage, scannerNames, testMode, includeBallotImages })
  );
  // Modify results to match the desired number of ballots
  if (numBallots !== undefined && numBallots < castVoteRecords.length) {
    stderr.write(
      `WARNING: At least ${castVoteRecords.length} are suggested to be generated for maximum coverage of ballot metadata options and possible contest votes.\n`
    );
    // Remove random entries from the CVR list until the desired number of ballots is reach
    while (numBallots < castVoteRecords.length) {
      const i = Math.floor(Math.random() * castVoteRecords.length);
      castVoteRecords.splice(i, 1);
    }
  }

  let ballotId = castVoteRecords.length;
  // Duplicate random ballots until the desired number of ballots is reached.
  while (numBallots !== undefined && numBallots > castVoteRecords.length) {
    const i = Math.floor(Math.random() * castVoteRecords.length);
    castVoteRecords.push({
      ...(castVoteRecords[i] as CastVoteRecord),
      _ballotId: unsafeParse(BallotIdSchema, `id-${ballotId}`),
    });
    ballotId += 1;
  }

  const stream = outputPath ? fs.createWriteStream(outputPath) : stdout;
  for (const record of castVoteRecords) {
    stream.write(`${JSON.stringify(record)}\n`);
  }
  await new Promise<void>((resolve) => {
    stream.end(resolve);
  });

  if (stream !== stdout) {
    stdout.write(
      `Wrote ${castVoteRecords.length} cast vote records to ${outputPath}\n`
    );
  }

  return 0;
}
