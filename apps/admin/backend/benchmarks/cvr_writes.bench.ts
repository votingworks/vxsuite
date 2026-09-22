import { afterAll, beforeAll, test } from 'vitest';
import { Election, Id } from '@votingworks/types';
import { assertDefined, err } from '@votingworks/basics';
import { Store } from '../src/store.js';
import { addMockCvrFileToStore } from '../test/mock_cvr_file.js';
import { buildVotes, DEFAULT_CVR_COUNT, openPerfStore } from './seed.js';
import { benchmarkRegressionTest } from './benchmarking.js';

/**
 * Benchmarks for the CVR write paths — import and adjudication — at high CVR
 * volume, tracking the cost of maintaining the cvrs indexes and triggers as
 * the table grows. Each run executes inside a rolled-back transaction so the
 * cached store is left unchanged and runs measure identical work; the index
 * and trigger maintenance being measured happens during the writes, before
 * the rollback.
 */

const IMPORT_CVR_COUNT = 10_000;
const ADJUDICATE_CVR_COUNT = 1_000;

/** Importing 10k CVRs, the ballpark of one large central scanner batch. */
const IMPORT_GOAL_MS = 10_000;

/** Adjudicating is interactive, but these are 1k ballots' worth of updates. */
const ADJUDICATE_GOAL_MS = 2_000;

let store: Store;
let electionId: Id;
let election: Election;

beforeAll(async () => {
  ({ store, electionId } = await openPerfStore(DEFAULT_CVR_COUNT));
  ({
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId)));
  process.stdout.write(`benchmarking at ${DEFAULT_CVR_COUNT} CVRs\n`);
}, 60 * 60_000);

afterAll(() => {
  store?.close();
});

function inRolledBackTransaction(fn: () => void): void {
  void store.withTransaction(() => {
    fn();
    return err('rollback');
  });
}

test('write: importing CVRs', async () => {
  const style = assertDefined(
    election.ballotStyles.find((bs) => bs.id === '1M')
  );
  const votes = buildVotes(election, style, {
    withWriteIn: false,
    withUndervote: false,
  });

  await benchmarkRegressionTest({
    label: 'importing CVRs',
    func: () =>
      inRolledBackTransaction(() =>
        addMockCvrFileToStore({
          electionId,
          store,
          pollingPlaceId: 'polling-place-1',
          mockCastVoteRecordFile: [
            {
              ballotStyleGroupId: style.groupId,
              batchId: 'bench-write-batch',
              scannerId: 'bench-write-scanner',
              scannerMachineType: 'central',
              precinctId: 'precinct-1',
              votingMethod: 'precinct',
              votes,
              card: { type: 'hmpb', sheetNumber: 1 },
              multiplier: IMPORT_CVR_COUNT,
            },
          ],
        })
      ),
    runs: 3,
    warmupRuns: 1,
    goalMs: IMPORT_GOAL_MS,
  });
});

test('write: adjudicating ballots', async () => {
  const cvrIds = store
    .getBallotAdjudicationQueue({ electionId })
    .slice(0, ADJUDICATE_CVR_COUNT);

  await benchmarkRegressionTest({
    label: 'adjudicating ballots',
    func: () =>
      inRolledBackTransaction(() => {
        for (const cvrId of cvrIds) {
          store.setCvrAdjudicated({ cvrId });
        }
      }),
    runs: 3,
    warmupRuns: 1,
    goalMs: ADJUDICATE_GOAL_MS,
  });
});
