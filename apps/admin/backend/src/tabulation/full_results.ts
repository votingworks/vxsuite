import { Tabulation } from '@votingworks/types';
import {
  combineElectionResults,
  convertManualElectionResults,
  mergeManualWriteInTallies,
  tabulateCastVoteRecords,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { Store } from '../store';
import {
  modifyElectionResultsWithWriteInSummary,
  tabulateWriteInTallies,
} from './write_ins';
import { tabulateManualResults } from './manual_results';

/**
 * Tabulate election results including all scanned and adjudicated information.
 */
export function tabulateElectionResults({
  store,
  filter = {},
  groupBy = {},
  includeWriteInAdjudicationResults,
  includeManualResults,
}: {
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
  includeWriteInAdjudicationResults?: boolean;
  includeManualResults?: boolean;
}): Tabulation.GroupedElectionResults {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const {
    electionDefinition: { election },
  } = electionRecord;

  // basic cast vote record tally with bucketed write-in counts
  const groupedElectionResults = tabulateCastVoteRecords({
    cvrs: store.getCastVoteRecords({ electionId, election, filter }),
    election,
    groupBy,
  });

  // replace bucketed write-in counts with write-in adjudication data
  // if specified
  if (includeWriteInAdjudicationResults) {
    const groupedWriteInSummaries = tabulateWriteInTallies({
      store,
      filter,
      groupBy,
    });

    for (const [groupKey, electionResults] of Object.entries(
      groupedElectionResults
    )) {
      const writeInSummary = groupedWriteInSummaries[groupKey];
      if (writeInSummary) {
        groupedElectionResults[groupKey] =
          modifyElectionResultsWithWriteInSummary(
            electionResults,
            writeInSummary
          );
      }
    }
  }

  // include manual results if specified
  if (includeManualResults) {
    const queryResult = tabulateManualResults({ store, filter, groupBy });

    // ignore manual results if the query is not successful
    if (queryResult.isOk()) {
      const groupedManualResults = queryResult.ok();
      for (const [groupKey, electionResults] of Object.entries(
        groupedElectionResults
      )) {
        const manualResults = groupedManualResults[groupKey];
        if (manualResults) {
          groupedElectionResults[groupKey] = combineElectionResults({
            election,
            allElectionResults: [
              electionResults,
              includeWriteInAdjudicationResults
                ? convertManualElectionResults(manualResults)
                : convertManualElectionResults(
                    mergeManualWriteInTallies(manualResults)
                  ),
            ],
          });
        }
      }
    }
  }

  return groupedElectionResults;
}
