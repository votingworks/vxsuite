import { expect, test, vi } from 'vitest';
import { err } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { DEFAULT_SYSTEM_SETTINGS, type Id } from '@votingworks/types';
import { getBallotCount } from '@votingworks/utils';
import { Store } from './store.js';
import { importCastVoteRecords } from './cast_vote_records.js';
import { tabulateElectionResults } from './tabulation/full_results.js';
import { writeTempElectionZip } from '../test/app.js';

const { castVoteRecordExport } =
  electionGridLayoutNewHampshireTestBallotFixtures;
const CVR_COUNT = 184;

async function storeWithElection(): Promise<{ store: Store; electionId: Id }> {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const { electionId } = (
    await store.importElectionPackage({
      packagePath: await writeTempElectionZip({
        electionDefinition:
          electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition(),
        systemSettings: DEFAULT_SYSTEM_SETTINGS,
      }),
    })
  ).unsafeUnwrap();
  store.setCurrentElectionId(electionId);
  return { store, electionId };
}

function importExport(store: Store) {
  return importCastVoteRecords(
    store,
    castVoteRecordExport.asDirectoryPath(),
    mockBaseLogger({ fn: vi.fn })
  );
}

function failAddingEntry(
  store: Store,
  callNumber: number,
  failure: 'throw' | 'error'
) {
  const addCastVoteRecordFileEntry =
    store.addCastVoteRecordFileEntry.bind(store);
  let calls = 0;
  return vi
    .spyOn(store, 'addCastVoteRecordFileEntry')
    .mockImplementation((params) => {
      calls += 1;
      if (calls !== callNumber) {
        return addCastVoteRecordFileEntry(params);
      }
      if (failure === 'throw') {
        throw new Error('interrupted');
      }
      return err({ type: 'ballot-id-already-exists-with-different-data' });
    });
}

async function countTalliedBallots(store: Store, electionId: Id) {
  const results = await tabulateElectionResults({ electionId, store });
  return getBallotCount(Object.values(results)[0]!.cardCounts);
}

test.each(['throw', 'error'] as const)(
  'a failed import removes the batches it already committed (%s)',
  async (failure) => {
    const { store, electionId } = await storeWithElection();
    failAddingEntry(store, 150, failure);

    if (failure === 'throw') {
      await expect(importExport(store)).rejects.toThrow('interrupted');
    } else {
      expect((await importExport(store)).err()).toEqual({
        type: 'ballot-id-already-exists-with-different-data',
        index: 149,
      });
    }

    expect(store.getCastVoteRecordCount(electionId)).toEqual(0);
    expect(store.getCvrFiles(electionId)).toEqual([]);
  }
);

test('re-importing an export interrupted by a crash adds the rest', async () => {
  const { store, electionId } = await storeWithElection();
  const addEntry = failAddingEntry(store, 150, 'throw');
  const deleteCvrFile = vi
    .spyOn(store, 'deleteCvrFile')
    .mockReturnValue(undefined);
  await expect(importExport(store)).rejects.toThrow('interrupted');
  addEntry.mockRestore();
  deleteCvrFile.mockRestore();
  expect(store.getCastVoteRecordCount(electionId)).toEqual(100);

  const result = (await importExport(store)).unsafeUnwrap();

  expect(result).toMatchObject({
    wasExistingFile: false,
    alreadyPresent: 100,
    newlyAdded: CVR_COUNT - 100,
  });
  expect(store.getCastVoteRecordCount(electionId)).toEqual(CVR_COUNT);
});

test('tallies taken mid-import do not outlive the import', async () => {
  const { store, electionId } = await storeWithElection();
  const withTransaction = store.withTransaction.bind(store);
  let transactions = 0;
  let midImportTally: Promise<number> | undefined;
  vi.spyOn(store, 'withTransaction').mockImplementation((fn) => {
    const result = withTransaction(fn);
    transactions += 1;
    if (transactions === 2) {
      midImportTally = countTalliedBallots(store, electionId);
    }
    return result;
  });

  (await importExport(store)).unsafeUnwrap();

  expect(await midImportTally).toEqual(100);
  expect(await countTalliedBallots(store, electionId)).toEqual(CVR_COUNT);
});
