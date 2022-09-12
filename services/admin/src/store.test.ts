import { Admin } from '@votingworks/api';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { typedAs } from '@votingworks/utils';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpNameSync } from 'tmp';
import { AddCastVoteRecordError, Store } from './store';

test('create a file store', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpDbPath = join(tmpDir, 'ballots.db');
  const store = Store.fileStore(tmpDbPath);

  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toBe(tmpDbPath);
});

test('create a memory store', () => {
  const store = Store.memoryStore();
  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toBe(':memory:');
});

test('add an election', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  store.assertElectionExists(electionId);
  expect(store.getElections().map((r) => r.id)).toContain(electionId);
});

test('assert election exists', () => {
  const store = Store.memoryStore();
  expect(() => store.assertElectionExists('foo')).toThrowError(
    'Election not found: foo'
  );
});

test('add a CVR file', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;
  expect(
    store
      .addCastVoteRecordFile({ electionId, filename: 'cvrs.jsonl', cvrFile })
      .unsafeUnwrap()
  ).toEqual({
    id: expect.stringMatching(/^[-0-9a-f]+$/),
    wasExistingFile: false,
    newlyAdded: 3000,
    alreadyPresent: 0,
  });
});

test('add a duplicate CVR file', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;
  const originalResult = store
    .addCastVoteRecordFile({ electionId, filename: 'cvrs.jsonl', cvrFile })
    .unsafeUnwrap();
  expect(originalResult).toEqual({
    id: expect.stringMatching(/^[-0-9a-f]+$/),
    wasExistingFile: false,
    newlyAdded: 3000,
    alreadyPresent: 0,
  });
  const duplicateResult = store
    .addCastVoteRecordFile({ electionId, filename: 'cvrs.jsonl', cvrFile })
    .unsafeUnwrap();
  expect(duplicateResult).toEqual({
    id: originalResult.id,
    wasExistingFile: true,
    newlyAdded: 0,
    alreadyPresent: 3000,
  });
});

test('analyze a CVR file', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;
  expect(
    store
      .addCastVoteRecordFile({
        electionId,
        filename: 'cvrs.jsonl',
        cvrFile,
        analyzeOnly: true,
      })
      .unsafeUnwrap()
  ).toEqual({
    id: expect.any(String),
    wasExistingFile: false,
    newlyAdded: 3000,
    alreadyPresent: 0,
  });

  // analyzing does not add to the store
  expect(store.getCastVoteRecordEntries(electionId)).toHaveLength(0);
});

test('adding a CVR file if adding an entry fails', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;

  jest.spyOn(store, 'addCastVoteRecordFileEntry').mockImplementation(() => {
    throw new Error('oops');
  });

  expect(() =>
    store
      .addCastVoteRecordFile({
        electionId,
        filename: 'cvrs.jsonl',
        cvrFile,
      })
      .unsafeUnwrap()
  ).toThrowError('oops');

  expect(store.getCastVoteRecordEntries(electionId)).toHaveLength(0);
});

test('add a CVR file entry without a ballot ID', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData.replaceAll(
    '_ballotId',
    '_notBallotId'
  );

  const result = store.addCastVoteRecordFile({
    electionId,
    filename: 'cvrs.jsonl',
    cvrFile,
  });

  expect(result.isErr()).toBe(true);
  expect(result.unsafeUnwrapErr()).toEqual(
    typedAs<AddCastVoteRecordError>({ kind: 'BallotIdRequired' })
  );
});

test('get CVR file metadata', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;

  expect(
    store.getCastVoteRecordFileMetadata('not a CVR file ID')
  ).toBeUndefined();

  const { id } = store
    .addCastVoteRecordFile({
      electionId,
      filename: 'cvrs.jsonl',
      cvrFile,
    })
    .unsafeUnwrap();

  const cvrFileMetadata = store.getCastVoteRecordFileMetadata(id);
  expect(cvrFileMetadata).toEqual(
    typedAs<Admin.CastVoteRecordFileMetadata>({
      id,
      electionId,
      filename: 'cvrs.jsonl',
      sha256Hash: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  );
});

test('get CVR file', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  const cvrFile = electionMinimalExhaustiveSampleFixtures.cvrData;

  expect(store.getCastVoteRecordFile('not a CVR file ID')).toBeUndefined();

  const { id } = store
    .addCastVoteRecordFile({
      electionId,
      filename: 'cvrs.jsonl',
      cvrFile,
    })
    .unsafeUnwrap();

  const cvrFileMetadata = store.getCastVoteRecordFile(id);
  expect(cvrFileMetadata).toEqual(
    typedAs<Admin.CastVoteRecordFileRecord>({
      id,
      electionId,
      filename: 'cvrs.jsonl',
      data: cvrFile,
      sha256Hash: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  );
});
