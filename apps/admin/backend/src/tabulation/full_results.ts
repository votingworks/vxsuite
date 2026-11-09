import type { Id, Tabulation } from '@votingworks/types';
import {
  combineElectionResults,
  convertManualElectionResults,
  mergeWriteInTallies,
  mergeTabulationGroupMaps,
  tabulateCastVoteRecords as tabulateFilteredCastVoteRecords,
  groupBySupportsZeroSplits,
} from '@votingworks/utils';
import { assert, assertDefined } from '@votingworks/basics';
import memoize from 'lodash.memoize';
import hash from 'object-hash';
import type { Store } from '../store.js';
import {
  getEmptyElectionWriteInSummary,
  modifyElectionResultsWithWriteInSummary,
  tabulateWriteInTallies,
} from './write_ins.js';
import { tabulateManualResults } from './manual_results.js';
import { rootDebug } from '../util/debug.js';
import { assertIsBackendFilter } from '../util/filters.js';
import { LeastRecentlyUsedMap } from '../util/lru_map.js';

const debug = rootDebug.extend('tabulation');

/**
 * Tabulate cast vote records with no write-in adjudication information.
 */
export function tabulateCastVoteRecords({
  electionId,
  store,
  filter = {},
  groupBy = {},
  blocking = false,
}: {
  electionId: Id;
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
  blocking?: boolean;
}): Promise<Tabulation.ElectionResultsGroupMap> {
  assertIsBackendFilter(filter);
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  // i.e. what pages need to be included on a report
  debug('determining what election result groups we expect, if any');
  const expectedGroups = groupBySupportsZeroSplits(groupBy)
    ? store.getTabulationGroups({
        electionId,
        election,
        groupBy,
        filter,
      })
    : undefined;

  debug('tabulating filtered cast vote records from the store');
  const cvrQuery: Parameters<Store['getCastVoteRecords']>[0] = {
    electionId,
    election,
    filter,
    excludeWithheldBallots: true,
  };
  return tabulateFilteredCastVoteRecords({
    cvrs: blocking
      ? store.getCastVoteRecordsSync(cvrQuery)
      : store.getCastVoteRecords(cvrQuery),
    election,
    groupBy,
    expectedGroups,
    yieldPeriodically: !blocking,
  });
}

// Replace the default `Map` cache with an LRU cache to avoid memory leaks.
memoize.Cache = LeastRecentlyUsedMap;

/**
 * Memoized version of `tabulateCastVoteRecords`.
 */
const tabulateCastVoteRecordsMemoized = memoize(
  tabulateCastVoteRecords,
  ({ store, electionId, filter, groupBy }) =>
    hash(
      {
        cvrsDataVersion: store.getCastVoteRecordsDataVersion(electionId),
        electionId,
        filter,
        groupBy,
      },
      {
        unorderedArrays: true,
        unorderedObjects: true,
      }
    )
);

const MAX_TABULATION_ATTEMPTS = 3;

/**
 * Tabulate election results including all scanned and adjudicated information.
 * Retries if the database changes partway, blocking on the last attempt, so a
 * report reflects one state.
 */
export async function tabulateElectionResults(
  params: Omit<Parameters<typeof tabulateElectionResultsOnce>[0], 'blocking'>
): Promise<Tabulation.ElectionResultsGroupMap> {
  for (let attempt = 1; attempt < MAX_TABULATION_ATTEMPTS; attempt += 1) {
    const changesBefore = params.store.getTotalChanges();
    const results = await tabulateElectionResultsOnce(params);
    if (params.store.getTotalChanges() === changesBefore) {
      return results;
    }
    debug('database changed during tabulation, retrying');
  }
  return tabulateElectionResultsOnce({ ...params, blocking: true });
}

async function tabulateElectionResultsOnce({
  electionId,
  store,
  filter = {},
  groupBy = {},
  includeWriteInAdjudicationResults,
  includeManualResults,
  blocking,
}: {
  electionId: Id;
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
  includeWriteInAdjudicationResults?: boolean;
  includeManualResults?: boolean;
  blocking?: boolean;
}): Promise<Tabulation.ElectionResultsGroupMap> {
  debug('tabulating election results');
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  debug('tabulating CVRs, ignoring write-in adjudication results');
  let groupedElectionResults = await tabulateCastVoteRecordsMemoized({
    electionId,
    store,
    filter,
    groupBy,
    blocking,
  });

  // replace bucketed write-in counts with write-in adjudication data
  // if specified
  if (includeWriteInAdjudicationResults) {
    debug('tabulating write-in adjudication results');
    const groupedWriteInSummaries = tabulateWriteInTallies({
      electionId,
      store,
      filter,
      groupBy,
      includeUnallocablePendingWriteInsAsPending: false,
      excludeWithheldBallots: true,
    });

    debug('merging write-in adjudication results into CVR results');
    groupedElectionResults = mergeTabulationGroupMaps(
      groupedElectionResults,
      groupedWriteInSummaries,
      (electionResults, writeInSummary) => {
        assert(electionResults); // results must exist if there is write-in data
        return modifyElectionResultsWithWriteInSummary(
          electionResults,
          writeInSummary ?? getEmptyElectionWriteInSummary(election)
        );
      }
    );
  }

  // include manual results if specified
  if (includeManualResults) {
    debug('tabulating manual results');
    const queryResult = tabulateManualResults({
      electionId,
      store,
      filter,
      groupBy,
    });

    // ignore manual results if the tabulation is not successful
    if (queryResult.isOk()) {
      debug('merging manual results into CVR results');
      const groupedManualResults = queryResult.ok();
      groupedElectionResults = mergeTabulationGroupMaps(
        groupedElectionResults,
        groupedManualResults,
        (scannedResults, manualResults) => {
          const resultsToCombine: Tabulation.ElectionResults[] = [];
          // @coverage-defer
          if (scannedResults) {
            resultsToCombine.push(scannedResults);
          }
          if (manualResults) {
            if (includeWriteInAdjudicationResults) {
              resultsToCombine.push(
                convertManualElectionResults(manualResults)
              );
            } else {
              resultsToCombine.push(
                convertManualElectionResults(mergeWriteInTallies(manualResults))
              );
            }
          }
          return combineElectionResults({
            election,
            allElectionResults: resultsToCombine,
          });
        }
      );
    } /* @coverage-exclude: debug only */ else {
      debug('filter or group by is not compatible with manual results');
    }
  }

  debug('done tabulating election results');
  return groupedElectionResults;
}
