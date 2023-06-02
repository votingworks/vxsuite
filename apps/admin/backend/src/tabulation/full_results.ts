import { Id, Tabulation } from '@votingworks/types';
import {
  combineElectionResults,
  convertManualElectionResults,
  extractGroupSpecifier,
  mergeManualWriteInTallies,
  tabulateCastVoteRecords as tabulateFilteredCastVoteRecords,
} from '@votingworks/utils';
import { assert, assertDefined } from '@votingworks/basics';
import { Store } from '../store';
import {
  modifyElectionResultsWithWriteInSummary,
  tabulateWriteInTallies,
} from './write_ins';
import { tabulateManualResults } from './manual_results';

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
}): Tabulation.GroupedElectionResults {
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  return tabulateFilteredCastVoteRecords({
    cvrs: store.getCastVoteRecords({ electionId, election, filter }),
    election,
    groupBy,
  });
}

/**
 * Tabulate election results including all scanned and adjudicated information.
 */
export function tabulateElectionResults({
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
}): Tabulation.GroupedElectionResults {
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  // basic cast vote record tally with bucketed write-in counts
  const groupedElectionResults = tabulateCastVoteRecords({
    electionId,
    store,
    filter,
    groupBy,
  });

  // replace bucketed write-in counts with write-in adjudication data
  // if specified
  if (includeWriteInAdjudicationResults) {
    const groupedWriteInSummaries = tabulateWriteInTallies({
      electionId,
      store,
      filter,
      groupBy,
    });

    for (const [groupKey, electionResults] of Object.entries(
      groupedElectionResults
    )) {
      const writeInSummary = groupedWriteInSummaries[groupKey];
      if (writeInSummary) {
        groupedElectionResults[groupKey] = {
          ...electionResults, // maintain group specifier
          ...modifyElectionResultsWithWriteInSummary(
            electionResults,
            writeInSummary
          ),
        };
      }
    }
  }

  // include manual results if specified
  if (includeManualResults) {
    const queryResult = tabulateManualResults({
      electionId,
      store,
      filter,
      groupBy,
    });

    // ignore manual results if the tabulation is not successful
    if (queryResult.isOk()) {
      const groupedManualResults = queryResult.ok();
      // unlike the write-in summaries, it's possible that manual results exist
      // where cast vote record election results do not
      const allGroupKeys = [
        ...new Set([
          ...Object.keys(groupedElectionResults),
          ...Object.keys(groupedManualResults),
        ]),
      ];
      for (const groupKey of allGroupKeys) {
        const resultsToCombine: Tabulation.ElectionResults[] = [];
        const scannedResults = groupedElectionResults[groupKey];
        if (scannedResults) {
          resultsToCombine.push(scannedResults);
        }
        const manualResults = groupedManualResults[groupKey];
        if (manualResults) {
          if (includeWriteInAdjudicationResults) {
            resultsToCombine.push(convertManualElectionResults(manualResults));
          } else {
            resultsToCombine.push(
              convertManualElectionResults(
                mergeManualWriteInTallies(manualResults)
              )
            );
          }
        }

        const someResults = manualResults || scannedResults;
        assert(someResults);
        const groupSpecifier = extractGroupSpecifier(someResults);

        groupedElectionResults[groupKey] = {
          ...groupSpecifier,
          ...combineElectionResults({
            election,
            allElectionResults: resultsToCombine,
          }),
        };
      }
    }
  }

  return groupedElectionResults;
}
