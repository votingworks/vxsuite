import { afterEach, beforeEach, expect, test } from 'vitest';
import fs from 'node:fs';
import { sha256 } from 'js-sha256';
import path from 'node:path';
import { dirSync } from 'tmp';
import { iter } from '@votingworks/basics';
import { Client } from '@votingworks/db';
import { CastVoteRecordExportFileName } from '@votingworks/types';

import {
  CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA,
  clearCastVoteRecordHashes,
  computeCastVoteRecordRootHashFromScratch,
  computeCombinedHash,
  computeSingleCastVoteRecordHash,
  getCastVoteRecordRootHash,
  hashableFileFromData,
  readableFileFromData,
  readableFileFromDisk,
  updateCastVoteRecordHashes,
} from './cast_vote_record_hashes';

let tempDirectoryPath: string;

beforeEach(() => {
  tempDirectoryPath = dirSync().name;
});

afterEach(() => {
  fs.rmSync(tempDirectoryPath, { recursive: true });
});

const castVoteRecordIds = [
  'a1234567-0000-0000-0000-000000000000',
  'a2345678-0000-0000-0000-000000000000',
  'ab123456-0000-0000-0000-000000000000',
  'ab234567-0000-0000-0000-000000000000',
  'ab345678-0000-0000-0000-000000000000',
  'c1234567-0000-0000-0000-000000000000',
  'e1234567-0000-0000-0000-000000000000',
] as const;

type CastVoteRecordId = (typeof castVoteRecordIds)[number];

// A minimal set of mock cast vote records for testing a branching factor of 3 at every level of
// the Merkle tree
const castVoteRecords: Record<
  CastVoteRecordId,
  string // Cast vote record report contents
> = {
  'a1234567-0000-0000-0000-000000000000': 'a',
  'a2345678-0000-0000-0000-000000000000': 'b',
  'ab123456-0000-0000-0000-000000000000': 'c',
  'ab234567-0000-0000-0000-000000000000': 'd',
  'ab345678-0000-0000-0000-000000000000': 'e',
  'c1234567-0000-0000-0000-000000000000': 'f',
  'e1234567-0000-0000-0000-000000000000': 'g',
};

function prepareCastVoteRecordExport(): string {
  const exportDirectoryPath = path.join(
    tempDirectoryPath,
    'cast-vote-record-export'
  );
  fs.mkdirSync(exportDirectoryPath);
  fs.writeFileSync(
    path.join(exportDirectoryPath, CastVoteRecordExportFileName.METADATA),
    ''
  );
  for (const [cvrId, cvrReportContents] of Object.entries(castVoteRecords)) {
    fs.mkdirSync(path.join(exportDirectoryPath, cvrId));
    fs.writeFileSync(
      path.join(
        exportDirectoryPath,
        cvrId,
        CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
      ),
      cvrReportContents
    );
  }
  return exportDirectoryPath;
}

/**
 * The root hash for the mock cast vote records represented by {@link castVoteRecords}
 */
const expectedCastVoteRecordRootHash =
  '9ae397df2e7f47e7a4dd004f3a45821a2a5c348e501576032f6d7bf16cebeb63';

test('readableFileFromData', async () => {
  const readableFile = readableFileFromData('1', 'a');
  expect(readableFile.fileName).toEqual('1');
  expect(await iter(readableFile.open()).toString()).toEqual('a');
  expect(await readableFile.computeSha256Hash()).toEqual(sha256('a'));
});

test('readableFileFromDisk', async () => {
  fs.writeFileSync(path.join(tempDirectoryPath, '1'), 'a');
  const readableFile = readableFileFromDisk(path.join(tempDirectoryPath, '1'));
  expect(readableFile.fileName).toEqual('1');
  expect(await iter(readableFile.open()).toString()).toEqual('a');
  expect(await readableFile.computeSha256Hash()).toEqual(sha256('a'));
});

test('computeSingleCastVoteRecordHash', async () => {
  const cvrId = castVoteRecordIds[0];
  const cvrReportContents = castVoteRecords[cvrId];
  const hash = await computeSingleCastVoteRecordHash(
    cvrId,
    hashableFileFromData(
      CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT,
      cvrReportContents
    )
  );
  const directorySummary =
    `${sha256(cvrReportContents)}  ` +
    `${cvrId}/${CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT}\n`;
  const expectedHash = sha256(directorySummary);
  expect(hash).toEqual(expectedHash);
});

test('computeCombinedHash', () => {
  const hash = computeCombinedHash([
    { hash: sha256('a'), sortKey: '2' },
    { hash: sha256('b'), sortKey: '3' },
    { hash: sha256('c'), sortKey: '1' },
  ]);
  const expectedHash = sha256(sha256('c') + sha256('a') + sha256('b'));
  expect(hash).toEqual(expectedHash);
});

test('getCastVoteRecordRootHash, updateCastVoteRecordHashes, and clearCastVoteRecordHashes', async () => {
  const client = Client.memoryClient();
  client.exec(CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA);

  async function updateCastVoteRecordHashesHelper(
    cvrId: CastVoteRecordId
  ): Promise<string> {
    const cvrReportContents = castVoteRecords[cvrId];
    const cvrHash = await computeSingleCastVoteRecordHash(
      cvrId,
      hashableFileFromData(
        CastVoteRecordExportFileName.METADATA,
        cvrReportContents
      )
    );
    updateCastVoteRecordHashes(client, cvrId, cvrHash);
    return cvrHash;
  }

  expect(getCastVoteRecordRootHash(client)).toEqual('');

  const cvr1Hash = await updateCastVoteRecordHashesHelper(
    'ab123456-0000-0000-0000-000000000000'
  );
  let abHash = sha256(cvr1Hash);
  let aHash = sha256(abHash);
  let rootHash = sha256(aHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const cvr2Hash = await updateCastVoteRecordHashesHelper(
    'ab345678-0000-0000-0000-000000000000'
  );
  abHash = sha256(cvr1Hash + cvr2Hash);
  aHash = sha256(abHash);
  rootHash = sha256(aHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const cvr3Hash = await updateCastVoteRecordHashesHelper(
    'a1234567-0000-0000-0000-000000000000'
  );
  const a1Hash = sha256(cvr3Hash);
  aHash = sha256(a1Hash + abHash);
  rootHash = sha256(aHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const cvr4Hash = await updateCastVoteRecordHashesHelper(
    'e1234567-0000-0000-0000-000000000000'
  );
  const e1Hash = sha256(cvr4Hash);
  const eHash = sha256(e1Hash);
  rootHash = sha256(aHash + eHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const cvr5Hash = await updateCastVoteRecordHashesHelper(
    'c1234567-0000-0000-0000-000000000000'
  );
  const c1Hash = sha256(cvr5Hash);
  const cHash = sha256(c1Hash);
  rootHash = sha256(aHash + cHash + eHash); // Reach branching factor of 3 at root
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const cvr6Hash = await updateCastVoteRecordHashesHelper(
    'ab234567-0000-0000-0000-000000000000'
  );
  abHash = sha256(cvr1Hash + cvr6Hash + cvr2Hash); // Reach branching factor of 3 at level 2
  aHash = sha256(a1Hash + abHash);
  rootHash = sha256(aHash + cHash + eHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const cvr7Hash = await updateCastVoteRecordHashesHelper(
    'a2345678-0000-0000-0000-000000000000'
  );
  const a2Hash = sha256(cvr7Hash);
  aHash = sha256(a1Hash + a2Hash + abHash); // Reach branching factor of 3 at level 1
  rootHash = sha256(aHash + cHash + eHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  expect(rootHash).toEqual(expectedCastVoteRecordRootHash);

  clearCastVoteRecordHashes(client);
  expect(getCastVoteRecordRootHash(client)).toEqual('');
});

test('computeCastVoteRecordRootHashFromScratch', async () => {
  const exportDirectoryPath = prepareCastVoteRecordExport();

  // Verify that the hash computed by computeCastVoteRecordRootHashFromScratch is equivalent to the
  // hash computed by the SQLite-backed functions
  expect(
    await computeCastVoteRecordRootHashFromScratch(exportDirectoryPath)
  ).toEqual(expectedCastVoteRecordRootHash);
});

test('computeCastVoteRecordRootHashFromScratch when no cast vote records', async () => {
  const exportDirectoryPath = path.join(
    tempDirectoryPath,
    'cast-vote-record-export'
  );
  fs.mkdirSync(exportDirectoryPath);

  expect(
    await computeCastVoteRecordRootHashFromScratch(exportDirectoryPath)
  ).toEqual('');
});
