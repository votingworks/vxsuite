import { beforeEach, expect, test, vi } from 'vitest';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { mockReadable, mockWritable } from '@votingworks/test-utils';
import { CastVoteRecordExportFileName } from '@votingworks/types';
import { ok } from '@votingworks/basics';
import { readCastVoteRecordExport } from '@votingworks/backend';
import { getFeatureFlagMock } from '@votingworks/utils';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sha256 } from 'js-sha256';
import { main } from './main';
import { main as generateCvrs } from '../generate-cvrs/main';

vi.setConfig({
  testTimeout: 60_000,
});

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

let workingDirectory: string;
let exportPath: string;

beforeEach(() => {
  workingDirectory = makeTemporaryDirectory();
  exportPath = join(workingDirectory, 'machine_0000__2024-01-01_00-00-00');
  mkdirSync(exportPath);
  mockFeatureFlagger.resetFeatureFlags();
});

async function run(
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdin = mockReadable();
  const stdout = mockWritable();
  const stderr = mockWritable();
  const exitCode = await main(
    [process.argv0, resolve(__dirname, './main'), ...args],
    { stdin, stdout, stderr }
  );
  return { exitCode, stdout: stdout.toString(), stderr: stderr.toString() };
}

// Generates a CVR export at `exportPath` from the given election data.
async function generateExport(electionPath: string): Promise<void> {
  const stdin = mockReadable();
  const stdout = mockWritable();
  const stderr = mockWritable();
  const exitCode = await generateCvrs(
    [
      process.argv0,
      'generate-cvrs',
      '--electionDefinition',
      electionPath,
      '--outputPath',
      exportPath,
    ],
    { stdin, stdout, stderr }
  );
  expect(exitCode).toEqual(0);
}

// Writes an election file with a tweaked id so it parses to a different ballot
// hash, simulating a metadata-only change. Returns its path and ballot hash.
function writeRehashedElection(electionData: string): {
  path: string;
  ballotHash: string;
} {
  const rehashed = JSON.stringify({
    ...JSON.parse(electionData),
    id: 'rehashed-election-id',
  });
  const path = join(workingDirectory, 'rehashed-election.json');
  writeFileSync(path, rehashed);
  return { path, ballotHash: sha256(rehashed) };
}

async function readExportElectionIds(): Promise<string[]> {
  const readResult = await readCastVoteRecordExport(exportPath);
  expect(readResult).toEqual(ok(expect.anything()));
  const { castVoteRecordIterator } = readResult.ok()!;
  const electionIds: string[] = [];
  for await (const result of castVoteRecordIterator) {
    expect(result).toEqual(ok(expect.anything()));
    electionIds.push(result.ok()!.castVoteRecord.ElectionId);
  }
  return electionIds;
}

test('--help', async () => {
  expect(await run(['--help'])).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining('--electionDefinition'),
    stderr: '',
  });
});

test('invalid option', async () => {
  expect(await run(['--invalid'])).toEqual({
    exitCode: 1,
    stdout: '',
    stderr: expect.stringContaining('Unknown argument: invalid'),
  });
});

test('errors without an election definition', async () => {
  expect(await run(['--cvrExportPath', exportPath])).toMatchObject({
    exitCode: 1,
    stderr: expect.stringContaining('Missing election definition'),
  });
});

test('errors without a cvr export path', async () => {
  expect(await run(['--electionDefinition', 'election.json'])).toMatchObject({
    exitCode: 1,
    stderr: expect.stringContaining('Missing cast vote record export path'),
  });
});

test('errors when the export has no cast vote records', async () => {
  const electionPath = join(workingDirectory, 'election.json');
  writeFileSync(
    electionPath,
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
      .electionData
  );
  expect(
    await run([
      '--electionDefinition',
      electionPath,
      '--cvrExportPath',
      exportPath,
    ])
  ).toMatchObject({
    exitCode: 1,
    stderr: expect.stringContaining('No cast vote records found'),
  });
});

test('errors when an existing ballot hash cannot be read', async () => {
  const electionPath = join(workingDirectory, 'election.json');
  writeFileSync(
    electionPath,
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
      .electionData
  );
  // A cast vote record directory whose report has no ElectionId.
  mkdirSync(join(exportPath, 'cvr-1'));
  writeFileSync(
    join(
      exportPath,
      'cvr-1',
      CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
    ),
    JSON.stringify({ CVR: [{}] })
  );
  expect(
    await run([
      '--electionDefinition',
      electionPath,
      '--cvrExportPath',
      exportPath,
    ])
  ).toMatchObject({
    exitCode: 1,
    stderr: expect.stringContaining('Could not read existing ballot hash'),
  });
});

test('is a no-op when the ballot hash is already up to date', async () => {
  const electionPath = join(workingDirectory, 'election.json');
  writeFileSync(
    electionPath,
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
      .electionData
  );
  await generateExport(electionPath);

  const result = await run([
    '--electionDefinition',
    electionPath,
    '--cvrExportPath',
    exportPath,
  ]);
  expect(result.exitCode).toEqual(0);
  expect(result.stdout).toContain('already up to date');
});

test('updates the ballot hash in an HMPB export in place', async () => {
  const { electionData } =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const electionPath = join(workingDirectory, 'election.json');
  writeFileSync(electionPath, electionData);
  await generateExport(electionPath);

  const { path: rehashedPath, ballotHash } =
    writeRehashedElection(electionData);
  const result = await run([
    '--electionDefinition',
    rehashedPath,
    '--cvrExportPath',
    exportPath,
  ]);
  expect(result.exitCode).toEqual(0);
  expect(result.stdout).toContain('Updated ballot hash');

  // The export re-validates — readCastVoteRecordExport recomputes/checks the
  // root hash, signature, and each BallotImage hash against its updated layout
  // file — and every CVR now references the new hash.
  const electionIds = await readExportElectionIds();
  expect(electionIds.length).toBeGreaterThan(0);
  expect(new Set(electionIds)).toEqual(new Set([ballotHash]));
});

test('updates the ballot hash in a BMD export (no layout files) in place', async () => {
  const { electionData } =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionPath = join(workingDirectory, 'election.json');
  writeFileSync(electionPath, electionData);
  await generateExport(electionPath);

  const { path: rehashedPath, ballotHash } =
    writeRehashedElection(electionData);
  const result = await run([
    '--electionDefinition',
    rehashedPath,
    '--cvrExportPath',
    exportPath,
  ]);
  expect(result.exitCode).toEqual(0);

  const electionIds = await readExportElectionIds();
  expect(electionIds.length).toBeGreaterThan(0);
  expect(new Set(electionIds)).toEqual(new Set([ballotHash]));
});
