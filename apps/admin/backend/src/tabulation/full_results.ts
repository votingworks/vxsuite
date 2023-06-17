import { Id, Tabulation } from '@votingworks/types';
import {
  combineElectionResults,
  convertManualElectionResults,
  extractGroupSpecifier,
  mergeManualWriteInTallies,
  mergeTabulationGroups,
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
  let groupedElectionResults = tabulateCastVoteRecords({
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

    groupedElectionResults = mergeTabulationGroups(
      groupedElectionResults,
      groupedWriteInSummaries,
      (electionResults, writeInSummary) => {
        assert(electionResults); // results must exist if there is write-in data
        return writeInSummary
          ? {
              ...electionResults, // maintain group specifier
              ...modifyElectionResultsWithWriteInSummary(
                electionResults,
                writeInSummary
              ),
            }
          : electionResults;
      }
    );
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
      groupedElectionResults = mergeTabulationGroups(
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
                convertManualElectionResults(
                  mergeManualWriteInTallies(manualResults)
                )
              );
            }
          }
          const eitherResults = manualResults || scannedResults;
          assert(eitherResults);
          const groupSpecifier = extractGroupSpecifier(eitherResults);
          return {
            ...groupSpecifier,
            ...combineElectionResults({
              election,
              allElectionResults: resultsToCombine,
            }),
          };
        }
      );
    }
  }

  return groupedElectionResults;
}
