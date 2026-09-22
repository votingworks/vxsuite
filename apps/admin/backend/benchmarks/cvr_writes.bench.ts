import { afterAll, beforeAll, test } from 'vitest';
import { Id } from '@votingworks/types';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { assertDefined, err } from '@votingworks/basics';
import { Store } from '../src/store.js';
import { importCastVoteRecords } from '../src/cast_vote_records.js';
import { DEFAULT_CVR_COUNT, openPerfStore } from './seed.js';
import { benchmarkRegressionTest } from './benchmarking.js';

/**
 * Benchmarks for the CVR write paths — import and adjudication — at high CVR
 * volume, tracking the cost of the import pipeline and of maintaining the
 * cvrs indexes and triggers as the table grows. The import benchmark runs
 * the full real pipeline (export reading, hashing, conversion, store writes)
 * and removes the imported file between runs, outside the measured window;
 * the adjudication benchmark executes inside a rolled-back transaction. In
 * both cases the cached store is left unchanged and runs measure identical
 * work.
 */

const ADJUDICATE_CVR_COUNT = 1_000;

/** Importing a full 500-CVR batch through the real import pipeline. */
const IMPORT_GOAL_MS = 10_000;

/** Adjudicating is interactive, but these are 1k ballots' worth of updates. */
const ADJUDICATE_GOAL_MS = 2_000;

/** Removing a single imported CVR file, a one-click user action. */
const DELETE_GOAL_MS = 5_000;

let store: Store;
let electionId: Id;
let cvrExportPath: string;

beforeAll(async () => {
  ({ store, electionId, cvrExportPath } =
    await openPerfStore(DEFAULT_CVR_COUNT));
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

test('write: importing a CVR export', async () => {
  const logger = new BaseLogger(LogSource.System);
  let importedFileId: Id | undefined;

  await benchmarkRegressionTest({
    label: 'importing a CVR export',
    func: async () => {
      const importResult = (
        await importCastVoteRecords(store, cvrExportPath, logger)
      ).unsafeUnwrap();
      importedFileId = importResult.id;
    },
    cleanup: () => {
      store.deleteCvrFile({
        electionId,
        fileId: assertDefined(importedFileId),
      });
    },
    runs: 3,
    warmupRuns: 1,
    goalMs: IMPORT_GOAL_MS,
  });
});

test('write: deleting a CVR import', async () => {
  const logger = new BaseLogger(LogSource.System);

  async function importExport(): Promise<Id> {
    return (
      await importCastVoteRecords(store, cvrExportPath, logger)
    ).unsafeUnwrap().id;
  }

  let importedFileId = await importExport();

  try {
    await benchmarkRegressionTest({
      label: 'deleting a CVR import',
      func: () => {
        store.deleteCvrFile({ electionId, fileId: importedFileId });
      },
      // re-import outside the measured window so the next run has a file to
      // delete; the trailing import is removed in the finally below
      cleanup: async () => {
        importedFileId = await importExport();
      },
      runs: 3,
      warmupRuns: 0,
      goalMs: DELETE_GOAL_MS,
    });
  } finally {
    // always remove the trailing import, even when the regression assertion
    // throws, so the cached store is left at its seeded size
    store.deleteCvrFile({ electionId, fileId: importedFileId });
  }
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
