import { CastVoteRecordExportFileName, CVR } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, parse } from 'node:path';
import {
  computeCastVoteRecordRootHashFromScratch,
  prepareSignatureFile,
} from '@votingworks/auth';
import { sha256 } from 'js-sha256';
import yargs from 'yargs/yargs';
import { populateImageAndLayoutFileHashes } from '../../generate-cvrs';

interface IO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

interface UpdateCvrFixtureHashesArguments {
  electionDefinition?: string;
  cvrExportPath?: string;
  help?: boolean;
  [x: string]: unknown;
}

/**
 * Updates the ballot hash recorded in an existing cast vote record export to
 * match its (already-edited) election definition, without regenerating the
 * export. Use this when an election fixture changes in a way that only affects
 * its ballot hash (e.g. an added metadata field) but not its ballot content:
 * the votes, ballot images, ids, and dates are all preserved, so the diff is
 * limited to the hash and the values derived from it.
 *
 * The hash appears as `ElectionId` in each cast-vote-record-report.json and as
 * `metadata.ballotHash` in each layout file. Changing a layout file's contents
 * changes its file hash, which is recorded in the report's `BallotImage` hashes,
 * which feeds the export's root hash in metadata.json, which is signed — so all
 * of those are recomputed too. The (blank placeholder) ballot images are
 * untouched.
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
        alias: 'e',
        description: 'Path to the (already-edited) election definition.',
      },
      cvrExportPath: {
        type: 'string',
        alias: 'o',
        description:
          'Path to the cast vote record export directory to update in place.',
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
  )) as UpdateCvrFixtureHashesArguments;

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
  if (!args.cvrExportPath) {
    stderr.write('Missing cast vote record export path\n');
    return 1;
  }
  const { electionDefinition: electionDefinitionPath, cvrExportPath } = args;

  const { ballotHash: newBallotHash } = (
    await readElection(electionDefinitionPath)
  ).unsafeUnwrap();

  const entries = await fs.readdir(cvrExportPath, { withFileTypes: true });
  const castVoteRecordDirectoryNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  function reportPathFor(directoryName: string): string {
    return join(
      cvrExportPath,
      directoryName,
      CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
    );
  }

  // Determine the current (stale) ballot hash from an existing report.
  const firstDirectoryName = castVoteRecordDirectoryNames[0];
  if (!firstDirectoryName) {
    stderr.write(`No cast vote records found in ${cvrExportPath}\n`);
    return 1;
  }
  const firstReport: CVR.CastVoteRecordReport = JSON.parse(
    await fs.readFile(reportPathFor(firstDirectoryName), 'utf8')
  );
  const oldBallotHash = firstReport.CVR?.[0]?.ElectionId;
  if (!oldBallotHash) {
    stderr.write(`Could not read existing ballot hash from ${cvrExportPath}\n`);
    return 1;
  }

  if (oldBallotHash === newBallotHash) {
    stdout.write(
      `Ballot hash already up to date (${newBallotHash.slice(
        0,
        7
      )}); nothing to do.\n`
    );
    return 0;
  }

  for (const directoryName of castVoteRecordDirectoryNames) {
    const directoryPath = join(cvrExportPath, directoryName);
    const reportPath = reportPathFor(directoryName);
    const report: CVR.CastVoteRecordReport = JSON.parse(
      await fs.readFile(reportPath, 'utf8')
    );

    for (const castVoteRecord of assertDefined(report.CVR)) {
      // ElectionId is the ballot hash and is typed readonly on the CDF type.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      (castVoteRecord.ElectionId as string) = newBallotHash;

      for (const ballotImage of castVoteRecord.BallotImage ?? []) {
        const imageFilePath = join(
          directoryPath,
          assertDefined(ballotImage.Location).replace('file:', '')
        );
        const layoutFilePath = imageFilePath.replace('.jpg', '.layout.json');

        // HMPB ballots have a layout file carrying the ballot hash; BMD ballots
        // have no layout file (the generator hashes the literal 'bmd-ballot').
        let layoutFileHash: string;
        if (existsSync(layoutFilePath)) {
          const layout = JSON.parse(await fs.readFile(layoutFilePath, 'utf8'));
          layout.metadata.ballotHash = newBallotHash;
          const layoutFileContents = JSON.stringify(layout);
          await fs.writeFile(layoutFilePath, layoutFileContents);
          layoutFileHash = sha256(layoutFileContents);
        } else {
          layoutFileHash = sha256('bmd-ballot');
        }

        populateImageAndLayoutFileHashes(ballotImage, {
          imageHash: sha256(await fs.readFile(imageFilePath)),
          layoutFileHash,
        });
      }
    }

    await fs.writeFile(reportPath, JSON.stringify(report));
  }

  // Recompute the export root hash over the updated files, then re-sign.
  const metadataPath = join(
    cvrExportPath,
    CastVoteRecordExportFileName.METADATA
  );
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  metadata.castVoteRecordRootHash =
    await computeCastVoteRecordRootHashFromScratch(cvrExportPath);
  const metadataFileContents = JSON.stringify(metadata);
  await fs.writeFile(metadataPath, metadataFileContents);

  process.env['VX_MACHINE_TYPE'] = 'scan'; // Required by prepareSignatureFile
  const signatureFile = await prepareSignatureFile({
    type: 'cast_vote_records',
    context: 'export',
    directoryName: basename(cvrExportPath),
    metadataFileContents,
  });
  await fs.writeFile(
    join(parse(cvrExportPath).dir, signatureFile.fileName),
    signatureFile.fileContents
  );

  stdout.write(
    `Updated ballot hash ${oldBallotHash.slice(0, 7)} -> ${newBallotHash.slice(
      0,
      7
    )} in ${
      castVoteRecordDirectoryNames.length
    } cast vote record(s) at ${cvrExportPath}\n`
  );
  return 0;
}
