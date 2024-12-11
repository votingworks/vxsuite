import {
  ElectionPackage,
  formatBallotHash,
  formatElectionPackageHash,
  safeParseElection,
} from '@votingworks/types';
import { readFileSync } from 'node:fs';
import { readElectionPackageFromFile } from '@votingworks/backend';
import yargs from 'yargs/yargs';
import { stdout } from 'node:process';
import { generateElectionPackage } from '../../generate-election-package';

// A script to generate an election package.
// Usage: ./bin/generate-election-package -e path/to/base-election-definition.json -o path/to/output-directory
// This will generate a election.json file and an associated election package with grid layouts all strings
// for the given base election. If --isMultiLanguage is provided the generated election & package will be
// multi-language. If --priorElectionPackage is provided, it will be used for translations and only new strings
// without translations in that election package will be translated.
interface IO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

interface GenerateElectionPackageFileArguments {
  electionDefinition: string;
  priorElectionPackage?: string;
  outputPath: string;
  isMultiLanguage: boolean;
  help?: boolean;
  [x: string]: unknown;
}

// eslint-disable-next-line vx/gts-jsdoc
export async function main(
  argv: readonly string[],
  { stderr }: IO
): Promise<number> {
  const optionParser = yargs()
    .strict()
    .exitProcess(false)
    .options({
      electionDefinition: {
        type: 'string',
        alias: 'e',
        description: 'Path to the base election definition.',
        required: true,
      },
      outputPath: {
        type: 'string',
        alias: 'o',
        description:
          'Path of directory to use as root of generated election and election-package output.',
        required: true,
      },
      isMultiLanguage: {
        type: 'boolean',
        default: false,
        description:
          'Whether to generate a multi-language election package or not.',
      },
      priorElectionPackage: {
        type: 'string',
        alias: 'p',
        description:
          'An election package that was a previous export of the given election definition. If provided, will be used for translations, and only new strings will be translated. Omit to force retranslation of all string.',
      },
    })
    .alias('-h', '--help')
    .help(false)
    .version(false)
    .fail((msg) => {
      stderr.write(`${msg}\n`);
      return 1;
    });

  const args = (await optionParser.parse(
    argv.slice(2)
  )) as GenerateElectionPackageFileArguments;

  // Path to a directory that should contain a baseElection.json and optionally an existing election package export.
  const baseElectionContents = readFileSync(args.electionDefinition, 'utf8');
  const vxfElection = safeParseElection(baseElectionContents);
  if (!vxfElection.isOk()) {
    stderr.write(`Error parsing election definition: ${vxfElection.err()}\n`);
    return 1;
  }

  const { isMultiLanguage } = args;
  let electionPackage: ElectionPackage | undefined;
  let electionPackageHash: string | undefined;
  // If we want to force retranslation we do not pass through the previously generated election package
  if (args.priorElectionPackage) {
    const result = await readElectionPackageFromFile(args.priorElectionPackage);
    if (result.isOk()) {
      electionPackage = result.ok().electionPackage;
      electionPackageHash = result.ok().electionPackageHash;
    }
  }

  try {
    if (electionPackage && electionPackageHash) {
      stdout.write(
        `Regenerating election package in ${
          args.outputPath
        } from existing package with ballotHash: ${formatBallotHash(
          electionPackage.electionDefinition.ballotHash
        )} electionPackageHash: ${formatElectionPackageHash(
          electionPackageHash
        )}\n`
      );
    } else {
      stdout.write(`Generating new election package in ${args.outputPath}\n`);
    }
    const [newBallotHash, newElectionHash] = await generateElectionPackage(
      vxfElection.ok(),
      args.outputPath,
      isMultiLanguage,
      electionPackage
    );
    stdout.write(
      `Successfully generated new election package in ${
        args.outputPath
      } with ballotHash: ${formatBallotHash(
        newBallotHash
      )} electionPackageHash: ${formatElectionPackageHash(newElectionHash)}\n`
    );
    return 0;
  } catch (e) {
    stderr.write(`Unexpected error generating election package: ${e}`);
    return 1;
  }
}
