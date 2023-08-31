import fs from 'fs';
import { sha256 } from 'js-sha256';
import path from 'path';
import { Readable } from 'stream';
import { dirSync } from 'tmp';
import { Client } from '@votingworks/db';

import {
  CAST_VOTE_RECORD_HASHES_TABLE_SCHEMA,
  ReadableFile,
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
  | 'a1234567-0000-0000-0000-000000000000'
  | 'a2345678-0000-0000-0000-000000000000'
  | 'ab123456-0000-0000-0000-000000000000'
  | 'ab234567-0000-0000-0000-000000000000'
  | 'ab345678-0000-0000-0000-000000000000'
  | 'c1234567-0000-0000-0000-000000000000'
  | 'e1234567-0000-0000-0000-000000000000';

type FileWithContents = ReadableFile & { fileContents: string };

function file(fileName: string, contents: string): FileWithContents {
  return {
    fileName,
    fileContents: contents,
    open: () => Readable.from(contents),
    computeSha256Hash: () => Promise.resolve(sha256(contents)),
  };
}

// A minimal set of mock cast vote records for testing a branching factor of 3 at every level of
// the Merkle tree
const castVoteRecords: Record<CastVoteRecordId, FileWithContents[]> = {
  'a1234567-0000-0000-0000-000000000000': [file('a', 'a1'), file('b', 'b1')],
  'a2345678-0000-0000-0000-000000000000': [file('a', 'a2'), file('b', 'b2')],
  'ab123456-0000-0000-0000-000000000000': [file('a', 'a3'), file('b', 'b3')],
  'ab234567-0000-0000-0000-000000000000': [file('a', 'a4'), file('b', 'b4')],
  'ab345678-0000-0000-0000-000000000000': [file('a', 'a5'), file('b', 'b5')],
  'c1234567-0000-0000-0000-000000000000': [file('a', 'a6'), file('b', 'b6')],
  'e1234567-0000-0000-0000-000000000000': [file('a', 'a7'), file('b', 'b7')],
};

/**
 * The root hash for the mock cast vote records represented by {@link castVoteRecords}
 */
const expectedCastVoteRecordRootHash =
  '03b88fdbe32c1115f6427953fd4364a737d85c0cf56a831249f1a4cd4c2a6b8a';

test('computeSingleCastVoteRecordHash', async () => {
  const hash = await computeSingleCastVoteRecordHash({
    directoryName: 'directory-name',
    files: [file('2', 'a'), file('3', 'b'), file('1', 'c')],
  });
  const directorySummary = `
${sha256('c')}  directory-name/1
${sha256('a')}  directory-name/2
${sha256('b')}  directory-name/3
`.trimStart();
  const expectedHash = sha256(directorySummary);
  expect(hash).toEqual(expectedHash);
});

test('computeSingleCastVoteRecordHash newline detection', async () => {
  /**
   * This input will spoof the following directory summary:
   * ${sha256('a')}  directory-name/1
   * ${sha256('b')}  directory-name/2
   * ${sha256('c')}  directory-name/3
   */
  const sneakyInput: Parameters<typeof computeSingleCastVoteRecordHash>[0] = {
    directoryName: 'directory-name',
    files: [file(`1\n${sha256('b')}  directory-name/2`, 'a'), file('3', 'c')],
  };
  await expect(computeSingleCastVoteRecordHash(sneakyInput)).rejects.toThrow();
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
    const cvrHash = await computeSingleCastVoteRecordHash({
      directoryName: cvrId,
      files: castVoteRecords[cvrId],
    });
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
  const exportDirectoryPath = path.join(
    tempDirectoryPath,
    'cast-vote-record-export'
  );
  fs.mkdirSync(exportDirectoryPath);
  fs.writeFileSync(path.join(exportDirectoryPath, 'metadata.json'), '');
  for (const [cvrId, cvrFiles] of Object.entries(castVoteRecords)) {
    fs.mkdirSync(path.join(exportDirectoryPath, cvrId));
    for (const { fileName, fileContents } of cvrFiles) {
      fs.writeFileSync(
        path.join(exportDirectoryPath, cvrId, fileName),
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
