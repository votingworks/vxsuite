import fs from 'fs';
import { sha256 } from 'js-sha256';
import path from 'path';
import { dirSync } from 'tmp';
import { Client } from '@votingworks/db';

import {
  CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA,
  File,
  clearCastVoteRecordHashes,
  computeCastVoteRecordRootHashFromScratch,
  computeCombinedHash,
  computeSingleCastVoteRecordHash,
  getCastVoteRecordRootHash,
  updateCastVoteRecordHashes,
} from './cast_vote_record_hashes';

let tempDirectoryPath: string;

beforeEach(() => {
  tempDirectoryPath = dirSync().name;
});

afterEach(() => {
  fs.rmSync(tempDirectoryPath, { recursive: true });
});

type CastVoteRecordId =
  | 'ab123456-0000-0000-0000-000000000000'
  | 'ab345678-0000-0000-0000-000000000000'
  | 'abcd1234-0000-0000-0000-000000000000'
  | 'abcd3456-0000-0000-0000-000000000000'
  | 'abcd5678-0000-0000-0000-000000000000'
  | 'cd123456-0000-0000-0000-000000000000'
  | 'ef123456-0000-0000-0000-000000000000';

// A minimal set of mock cast vote records for testing a branching factor of 3 at every level of
// the Merkle tree
const castVoteRecords: Record<CastVoteRecordId, File[]> = {
  'ab123456-0000-0000-0000-000000000000': [
    { fileName: 'a', fileContents: 'a1' },
    { fileName: 'b', fileContents: 'b1' },
  ],
  'ab345678-0000-0000-0000-000000000000': [
    { fileName: 'a', fileContents: 'a2' },
    { fileName: 'b', fileContents: 'b2' },
  ],
  'abcd1234-0000-0000-0000-000000000000': [
    { fileName: 'a', fileContents: 'a3' },
    { fileName: 'b', fileContents: 'b3' },
  ],
  'abcd3456-0000-0000-0000-000000000000': [
    { fileName: 'a', fileContents: 'a4' },
    { fileName: 'b', fileContents: 'b4' },
  ],
  'abcd5678-0000-0000-0000-000000000000': [
    { fileName: 'a', fileContents: 'a5' },
    { fileName: 'b', fileContents: 'b5' },
  ],
  'cd123456-0000-0000-0000-000000000000': [
    { fileName: 'a', fileContents: 'a6' },
    { fileName: 'b', fileContents: 'b6' },
  ],
  'ef123456-0000-0000-0000-000000000000': [
    { fileName: 'a', fileContents: 'a7' },
    { fileName: 'b', fileContents: 'b7' },
  ],
};

/**
 * The root hash for the mock cast vote records represented by {@link castVoteRecords}
 */
const expectedCastVoteRecordRootHash =
  '282f2b50176debeec49f60de0a3e0c9c5cbcf6b4bbc800eec6b8be161d43fdec';

test('computeSingleCastVoteRecordHash', () => {
  const hash = computeSingleCastVoteRecordHash({
    directoryName: 'directory-name',
    files: [
      { fileName: '2', fileContents: 'a' },
      { fileName: '3', fileContents: 'b' },
      { fileName: '1', fileContents: 'c' },
    ],
  });
  const directorySummary = `
${sha256('c')}  directory-name/1
${sha256('a')}  directory-name/2
${sha256('b')}  directory-name/3
`.trimStart();
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

test('getCastVoteRecordRootHash, updateCastVoteRecordHashes, and clearCastVoteRecordHashes', () => {
  const client = Client.memoryClient();
  client.exec(CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA);

  function updateCastVoteRecordHashesHelper(
    castVoteRecordId: CastVoteRecordId
  ): string {
    const castVoteRecordHash = computeSingleCastVoteRecordHash({
      directoryName: castVoteRecordId,
      files: castVoteRecords[castVoteRecordId],
    });
    updateCastVoteRecordHashes(client, castVoteRecordId, castVoteRecordHash);
    return castVoteRecordHash;
  }

  expect(getCastVoteRecordRootHash(client)).toEqual('');

  const leaf1Hash = updateCastVoteRecordHashesHelper(
    'abcd1234-0000-0000-0000-000000000000'
  );
  let abcdHash = sha256(leaf1Hash);
  let abHash = sha256(abcdHash);
  let rootHash = sha256(abHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const leaf2Hash = updateCastVoteRecordHashesHelper(
    'abcd5678-0000-0000-0000-000000000000'
  );
  abcdHash = sha256(leaf1Hash + leaf2Hash);
  abHash = sha256(abcdHash);
  rootHash = sha256(abHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const leaf3Hash = updateCastVoteRecordHashesHelper(
    'ab123456-0000-0000-0000-000000000000'
  );
  const ab12Hash = sha256(leaf3Hash);
  abHash = sha256(ab12Hash + abcdHash);
  rootHash = sha256(abHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const leaf4Hash = updateCastVoteRecordHashesHelper(
    'ef123456-0000-0000-0000-000000000000'
  );
  const ef12Hash = sha256(leaf4Hash);
  const efHash = sha256(ef12Hash);
  rootHash = sha256(abHash + efHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const leaf5Hash = updateCastVoteRecordHashesHelper(
    'cd123456-0000-0000-0000-000000000000'
  );
  const cd12Hash = sha256(leaf5Hash);
  const cdHash = sha256(cd12Hash);
  rootHash = sha256(abHash + cdHash + efHash); // Reach branching factor of 3 at root
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const leaf6Hash = updateCastVoteRecordHashesHelper(
    'abcd3456-0000-0000-0000-000000000000'
  );
  abcdHash = sha256(leaf1Hash + leaf6Hash + leaf2Hash); // Reach branching factor of 3 at level 2
  abHash = sha256(ab12Hash + abcdHash);
  rootHash = sha256(abHash + cdHash + efHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  const leaf7Hash = updateCastVoteRecordHashesHelper(
    'ab345678-0000-0000-0000-000000000000'
  );
  const ab34Hash = sha256(leaf7Hash);
  abHash = sha256(ab12Hash + ab34Hash + abcdHash); // Reach branching factor of 3 at level 1
  rootHash = sha256(abHash + cdHash + efHash);
  expect(getCastVoteRecordRootHash(client)).toEqual(rootHash);

  expect(rootHash).toEqual(expectedCastVoteRecordRootHash);

  clearCastVoteRecordHashes(client);
  expect(getCastVoteRecordRootHash(client)).toEqual('');
});

test('computeCastVoteRecordRootHashFromScratch', async () => {
  const exportDirectoryPath = path.join(
    tempDirectoryPath,
    'cast-vote-record-export'
  );
  fs.mkdirSync(exportDirectoryPath);
  fs.writeFileSync(path.join(exportDirectoryPath, 'metadata.json'), '');
  for (const [castVoteRecordId, castVoteRecordFiles] of Object.entries(
    castVoteRecords
  )) {
    fs.mkdirSync(path.join(exportDirectoryPath, castVoteRecordId));
    for (const { fileName, fileContents } of castVoteRecordFiles) {
      fs.writeFileSync(
        path.join(exportDirectoryPath, castVoteRecordId, fileName),
        fileContents
      );
    }
  }

  // Verify that the hash computed by computeCastVoteRecordRootHashFromScratch is equivalent to the
  // hash computed by the SQLite-backed functions
  expect(
    await computeCastVoteRecordRootHashFromScratch(exportDirectoryPath)
  ).toEqual(expectedCastVoteRecordRootHash);
});
