import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpNameSync } from 'tmp';

import { Store } from './store';

function addTestCvrFile(store: Store): string {
  const id = store.addCvrFile(
    'abc',
    'cvrs.jsonl',
    '123',
    ['123', 'abc'],
    ['zoo'],
    false
  );
  return id;
}

function addTestCvr(store: Store, { ballotId } = { ballotId: '123' }): string {
  const id = store.addCvr(ballotId, addTestCvrFile(store), 'test') as string;
  return id;
}

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

test('add/get adjudications', () => {
  const store = Store.memoryStore();
  const cvrId = addTestCvr(store);

  const id = store.addAdjudication('mayor', cvrId, 'Mickey Mouse');
  let added = store.getAdjudicationById(id);

  expect(added).toEqual({
    id,
    contestId: 'mayor',
    transcribedValue: 'Mickey Mouse',
  });
  store.updateAdjudicationTranscribedValue(id, 'Mickey');
  added = store.getAdjudicationById(id);
  expect(added?.transcribedValue).toEqual('Mickey');
});

test('getAdjudicationsByContestId', () => {
  const store = Store.memoryStore();
  const cvrId = addTestCvr(store);

  const adjudicationId = store.addAdjudication('mayor', cvrId, 'Minnie Mouse');
  const adjudicationId2 = store.addAdjudication('mayor', cvrId, 'Goofy');
  store.addAdjudication('assistant-mayor', cvrId, 'Mickey Mouse');

  // Does not include duplicates and is in alphabetical order
  expect(store.getAdjudicationsByContestId('mayor')).toEqual([
    {
      contestId: 'mayor',
      cvrId,
      id: adjudicationId,
      transcribedValue: 'Minnie Mouse',
    },
    {
      contestId: 'mayor',
      cvrId,
      id: adjudicationId2,
      transcribedValue: 'Goofy',
    },
  ]);
});

test('getAdjudicationCountsGroupedByContestId', () => {
  const store = Store.memoryStore();
  const cvrId = addTestCvr(store);

  store.addAdjudication('mayor', cvrId, 'Minnie Mouse');
  store.addAdjudication('mayor', cvrId, 'Goofy');
  store.addAdjudication('assistant-mayor', cvrId, 'Mickey Mouse');

  expect(store.getAdjudicationCountsGroupedByContestId()).toEqual([
    {
      contestId: 'assistant-mayor',
      adjudicationCount: 1,
    },
    {
      contestId: 'mayor',
      adjudicationCount: 2,
    },
  ]);
});

test('addCvr throws when adding a CVR with duplicate ballotId', () => {
  const store = Store.memoryStore();
  const cvrFileId = store.addCvrFile(
    'abc',
    'cvrs.jsonl',
    '123',
    ['123', 'abc'],
    ['zoo'],
    false
  );
  store.addCvr('123', cvrFileId, 'test') as string;
  expect(() => {
    const nullCvrId = store.addCvr('123', cvrFileId, 'test');
    expect(nullCvrId).toBeNull();
  }).toThrowError('UNIQUE constraint failed: cvrs.ballot_id');
});

test('getAllCvrFiles', () => {
  const store = Store.memoryStore();
  addTestCvrFile(store);
  addTestCvrFile(store);
  expect(store.getAllCvrFiles()).toHaveLength(2);
});

test('getAllCvrBallotIds', () => {
  const store = Store.memoryStore();
  addTestCvr(store, { ballotId: '123' });
  addTestCvr(store, { ballotId: '456' });
  expect(store.getAllCvrBallotIds()).toEqual(['123', '456']);
});

test('deleteCvrs', () => {
  const store = Store.memoryStore();
  const cvrId = addTestCvr(store);

  store.addAdjudication('mayor', cvrId, 'Minnie Mouse');

  expect(store.getAdjudicationsByContestId('mayor')).toHaveLength(1);

  // Deleting CVRs also deletes the associated adjudications
  store.deleteCvrs();
  expect(store.getAdjudicationsByContestId('mayor')).toHaveLength(0);
});

test('getAllTranscribedValues', () => {
  const store = Store.memoryStore();
  const cvrId = addTestCvr(store);

  store.addAdjudication('mayor', cvrId, 'Mickey Mouse');
  store.addAdjudication('assistant-mayor', cvrId, 'Mickey Mouse');
  store.addAdjudication('county-commissioner', cvrId, 'Daffy');

  // Does not include duplicates and is in alphabetical order
  expect(store.getAllTranscribedValues()).toEqual(['Daffy', 'Mickey Mouse']);

  // Does not include empty strings
  store.addAdjudication('chief-of-staff', cvrId, '');
  expect(store.getAllTranscribedValues()).toEqual(['Daffy', 'Mickey Mouse']);
});

test('getAdjudicationCountsByContestIdAndTranscribedValue', () => {
  const store = Store.memoryStore();
  const cvrId = addTestCvr(store);

  store.addAdjudication('mayor', cvrId, 'Mickey Mouse');
  store.addAdjudication('mayor', cvrId, 'Mickey Mouse');
  store.addAdjudication('county-commissioner', cvrId, 'Daffy');
  expect(store.getAdjudicationCountsByContestIdAndTranscribedValue()).toEqual([
    {
      contestId: 'county-commissioner',
      transcribedValue: 'Daffy',
      adjudicationCount: 1,
    },
    {
      contestId: 'mayor',
      transcribedValue: 'Mickey Mouse',
      adjudicationCount: 2,
    },
  ]);
});
