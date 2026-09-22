import { afterAll, beforeAll, test } from 'vitest';
import { Election, Id } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { Store } from '../src/store.js';
import {
  tabulateElectionResults,
  tabulateCastVoteRecords,
} from '../src/tabulation/full_results.js';
import { tabulateFullCardCounts } from '../src/tabulation/card_counts.js';
import { tabulateTallyReportResults } from '../src/tabulation/tally_reports.js';
import { getOverallElectionWriteInSummary } from '../src/tabulation/write_ins.js';
import { DEFAULT_CVR_COUNT, openPerfStore } from './seed.js';
import { benchmarkRegressionTest } from './benchmarking.js';

/**
 * Benchmarks for tabulation — ballot counts, tally reports, and write-in
 * summaries — at high CVR volume, against a synthetically seeded store.
 * Failures come from the baseline-regression checks; each benchmark also
 * carries an informational time goal describing what the path should
 * eventually meet at this scale.
 */

/** Queries that run once when a user opens a screen. */
const SCREEN_QUERY_GOAL_MS = 2_000;

/** Full CVR tabulation without the benefit of the memoized cache. */
const UNCACHED_TABULATION_GOAL_MS = 30_000;

/** Repeat tally report tabulation, served by the memoized caches. */
const WARM_TABULATION_GOAL_MS = 2_000;

/** Ballot count report tabulation (SQL group-by path). */
const BALLOT_COUNT_REPORT_GOAL_MS = 5_000;

/** Write-in summary tabulation behind the write-in adjudication report. */
const WRITE_IN_REPORT_GOAL_MS = 2_000;

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

test('screen: total ballot count (ungrouped card counts)', async () => {
  await benchmarkRegressionTest({
    label: 'total ballot count',
    func: () => tabulateFullCardCounts({ electionId, election, store }),
    runs: 3,
    warmupRuns: 1,
    goalMs: SCREEN_QUERY_GOAL_MS,
  });
});

test('report: ballot count report grouped by precinct', async () => {
  await benchmarkRegressionTest({
    label: 'ballot count report by precinct',
    func: () =>
      tabulateFullCardCounts({
        electionId,
        election,
        store,
        groupBy: { groupByPrecinct: true },
      }),
    runs: 3,
    warmupRuns: 1,
    goalMs: BALLOT_COUNT_REPORT_GOAL_MS,
  });
});

test('report: uncached CVR tabulation', async () => {
  await benchmarkRegressionTest({
    label: 'uncached CVR tabulation',
    func: async () => {
      await tabulateCastVoteRecords({ electionId, store });
    },
    runs: 3,
    warmupRuns: 0,
    goalMs: UNCACHED_TABULATION_GOAL_MS,
  });
});

test('report: full election tally report, warm caches', async () => {
  await benchmarkRegressionTest({
    label: 'tally report warm',
    func: async () => {
      await tabulateTallyReportResults({ electionId, store });
    },
    runs: 5,
    goalMs: WARM_TABULATION_GOAL_MS,
  });
});

test('report: tally results with manual + write-in merging, warm caches', async () => {
  await benchmarkRegressionTest({
    label: 'tally results warm',
    func: async () => {
      await tabulateElectionResults({
        electionId,
        store,
        includeWriteInAdjudicationResults: true,
        includeManualResults: true,
      });
    },
    runs: 5,
    goalMs: WARM_TABULATION_GOAL_MS,
  });
});

test('report: election write-in summary', async () => {
  await benchmarkRegressionTest({
    label: 'election write-in summary',
    func: () => getOverallElectionWriteInSummary({ electionId, store }),
    runs: 3,
    warmupRuns: 1,
    goalMs: WRITE_IN_REPORT_GOAL_MS,
  });
});
