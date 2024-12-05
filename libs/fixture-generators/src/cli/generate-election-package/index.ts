import {
  ElectionPackage,
  formatBallotHash,
  formatElectionPackageHash,
  safeParseElection,
} from '@votingworks/types';
import { readdirSync, readFileSync } from 'node:fs';
import { assertDefined } from '@votingworks/basics';
import { readElectionPackageFromFile } from '@votingworks/backend';
import path from 'node:path';
import { stdout } from 'node:process';
import { generateElectionPackage } from '../../generate-election-package';

// A script to generate an election package.
// Usage: ./generate-election-package <election_fixtures_directory_path> <is_multi_language> <force_restranslate>
// Given a path to a directory for fixtures related to that election which must contain:
// - electionBase.json: the base election definition, without grid layouts or ballot strings
// - election-package-*.zip: an existing election package, if available

// An election package will be generated with an election file that contains the grid layouts
// and translations generated for that election. Whether the generated election is single language (english only)
// or multi language with all currently supported languages is toggled with the second argument.
// The resulting election package will be stored to the provided directory. If an existing election package exists in that directory it will
// be used as a cache for translations. If no new strings are added the audio files from that election
// package will be copied and not regenerated. Re-translation and synthesis of audio files can be forced
// by passing a third argument of '1'.

// The generated election.json file for this election package will be stored alongside it in the
// election package directory for convenance.

interface IO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

// eslint-disable-next-line vx/gts-jsdoc
export async function main(
  argv: readonly string[],
  { stderr }: IO
): Promise<number> {
  if (argv.length !== 5) {
    stderr.write(
      'Usage: generate-election-package <election_fixtures_directory_path> <is_multi_language> <force_restranslate>]\n'
    );
    return 1;
  }

  // Path to a directory that should contain a baseElection.json and optionally an existing election package export.
  const electionFixturesDirectoryPath = assertDefined(argv[2]);
  const baseElectionContents = readFileSync(
    path.join(electionFixturesDirectoryPath, 'electionBase.json'),
    'utf8'
  );
  const vxfElection = safeParseElection(baseElectionContents);
  if (!vxfElection.isOk()) {
    stderr.write(`Error parsing election definition: ${vxfElection.err()}\n`);
    return 1;
  }

  const isMultiLanguage = argv[3] !== '0';
  const shouldRetranslate = argv[4] !== '0';
  let electionPackage: ElectionPackage | undefined;
  let electionPackageHash: string | undefined;
  // If we want to force retranslation we do not pass through the previously generated election package
  if (!shouldRetranslate) {
    const files = readdirSync(electionFixturesDirectoryPath);
    const electionPackageFile = files.find(
      (f) => f === 'election-package-default-system-settings.zip'
    );

    if (electionPackageFile) {
      const result = await readElectionPackageFromFile(
        path.join(electionFixturesDirectoryPath, electionPackageFile)
      );
      if (result.isOk()) {
        electionPackage = result.ok().electionPackage;
        electionPackageHash = result.ok().electionPackageHash;
      }
    }
  }

  try {
    if (electionPackage && electionPackageHash) {
      stdout.write(
        `Regenerating election package in ${electionFixturesDirectoryPath} from existing package with ballotHash: ${formatBallotHash(
          electionPackage.electionDefinition.ballotHash
        )} electionPackageHash: ${formatElectionPackageHash(
          electionPackageHash
        )}\n`
      );
    } else {
      stdout.write(
        `Generating new election package in ${electionFixturesDirectoryPath}\n`
      );
    }
    const [newBallotHash, newElectionHash] = await generateElectionPackage(
      vxfElection.ok(),
      electionFixturesDirectoryPath,
      isMultiLanguage,
      electionPackage
    );
    stdout.write(
      `Successfully generated new election package in ${electionFixturesDirectoryPath} with ballotHash: ${formatBallotHash(
        newBallotHash
      )} electionPackageHash: ${formatElectionPackageHash(newElectionHash)}\n`
    );
    return 0;
  } catch (e) {
    stderr.write(`Unexpected error generating election package: ${e}`);
    return 1;
  }
}
