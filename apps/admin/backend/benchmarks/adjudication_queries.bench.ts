import { afterAll, beforeAll, test } from 'vitest';
import { Id } from '@votingworks/types';
import { Store } from '../src/store.js';
import { DEFAULT_CVR_COUNT, openPerfStore } from './seed.js';
import { benchmarkRegressionTest } from './benchmarking.js';

/**
 * Benchmarks for the ballot adjudication queue queries at high CVR volume,
 * against a synthetically seeded store. Failures come from the
 * baseline-regression checks; each benchmark also carries an informational
 * time goal describing what the path should eventually meet at this scale.
 */

/**
 * better-sqlite3 runs queries synchronously on the Node event loop, so a
 * query polled every second by every connected frontend blocks ALL other
 * backend requests for its full duration.
 */
const POLLED_QUERY_GOAL_MS = 100;

/** Queries that run once when a user opens a screen. */
const SCREEN_QUERY_GOAL_MS = 2_000;

let store: Store;
let electionId: Id;

beforeAll(async () => {
  ({ store, electionId } = await openPerfStore(DEFAULT_CVR_COUNT));
  process.stdout.write(`benchmarking at ${DEFAULT_CVR_COUNT} CVRs\n`);
}, 60 * 60_000);

afterAll(() => {
  store?.close();
});

test('polled: getBallotAdjudicationQueueMetadata', async () => {
  await benchmarkRegressionTest({
    label: 'adjudication queue metadata',
    func: () => store.getBallotAdjudicationQueueMetadata({ electionId }),
    runs: 5,
    warmupRuns: 1,
    goalMs: POLLED_QUERY_GOAL_MS,
  });
});

test('polled: getNextCvrIdForBallotAdjudication', async () => {
  await benchmarkRegressionTest({
    label: 'next ballot for adjudication',
    func: () =>
      store.getNextCvrIdForBallotAdjudication({
        electionId,
        machineId: 'bench-machine',
      }),
    runs: 5,
    warmupRuns: 1,
    goalMs: POLLED_QUERY_GOAL_MS,
  });
});

test('screen: getBallotAdjudicationQueue', async () => {
  await benchmarkRegressionTest({
    label: 'adjudication queue listing',
    func: () => store.getBallotAdjudicationQueue({ electionId }),
    runs: 3,
    warmupRuns: 1,
    goalMs: SCREEN_QUERY_GOAL_MS,
  });
});
