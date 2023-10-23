import { Id, Tabulation } from '@votingworks/types';
import {
  combineElectionResults,
  convertManualElectionResults,
  mergeWriteInTallies,
  mergeTabulationGroupMaps,
  tabulateCastVoteRecords as tabulateFilteredCastVoteRecords,
  groupBySupportsZeroSplits,
} from '@votingworks/utils';
import { assert, assertDefined } from '@votingworks/basics';
import { Store } from '../store';
import {
  modifyElectionResultsWithWriteInSummary,
  tabulateWriteInTallies,
} from './write_ins';
import { tabulateManualResults } from './manual_results';
import { rootDebug } from '../util/debug';

const debug = rootDebug.extend('tabulation');

/**
 * Tabulate cast vote records with no write-in adjudication information.
 */
export function tabulateCastVoteRecords({
  electionId,
  store,
  filter = {},
  groupBy = {},
}: {
  electionId: Id;
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
}): Promise<Tabulation.ElectionResultsGroupMap> {
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  // i.e. what pages need to be included on a report
  debug('determining what election result groups we expect, if any');
  const expectedGroups = groupBySupportsZeroSplits(groupBy)
    ? store.getTabulationGroups({
        electionId,
        groupBy,
        filter,
      })
    : undefined;

  debug('tabulating filtered cast vote records from the store');
  return tabulateFilteredCastVoteRecords({
    cvrs: store.getCastVoteRecords({ electionId, filter }),
    election,
    groupBy,
    expectedGroups,
  });
}

/**
 * Tabulate election results including all scanned and adjudicated information.
 */
export async function tabulateElectionResults({
  electionId,
  store,
  filter = {},
  groupBy = {},
  includeWriteInAdjudicationResults,
  includeManualResults,
}: {
  electionId: Id;
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
  includeWriteInAdjudicationResults?: boolean;
  includeManualResults?: boolean;
}): Promise<Tabulation.ElectionResultsGroupMap> {
  debug('tabulating election results');
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  debug('tabulating CVRs, ignoring write-in adjudication results');
  let groupedElectionResults = await tabulateCastVoteRecords({
    electionId,
    store,
    filter,
    groupBy,
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
    });

    debug('merging write-in adjudication results into CVR results');
    groupedElectionResults = mergeTabulationGroupMaps(
      groupedElectionResults,
      groupedWriteInSummaries,
      (electionResults, writeInSummary) => {
        assert(electionResults); // results must exist if there is write-in data
        return writeInSummary
          ? modifyElectionResultsWithWriteInSummary(
              electionResults,
              writeInSummary
            )
          : electionResults;
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
      /* c8 ignore next 3 - debug only */
    } else {
      debug('filter or group by is not compatible with manual results');
    }
  }

  debug('done tabulating election results');
  return groupedElectionResults;
}
