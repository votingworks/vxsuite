import { Id, Tabulation } from '@votingworks/types';
import {
  combineElectionResults,
  convertManualElectionResults,
  getEmptyElectionResults,
  mergeWriteInTallies,
  mergeTabulationGroupMaps,
  tabulateCastVoteRecords as tabulateFilteredCastVoteRecords,
} from '@votingworks/utils';
import { assert, assertDefined, mapObject } from '@votingworks/basics';
import { Store } from '../store';
import {
  modifyElectionResultsWithWriteInSummary,
  tabulateWriteInTallies,
} from './write_ins';
import { tabulateManualResults } from './manual_results';
import { TallyReportResults } from '../types';

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

  return tabulateFilteredCastVoteRecords({
    cvrs: store.getCastVoteRecords({ electionId, election, filter }),
    election,
    groupBy,
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
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  // basic cast vote record tally with bucketed write-in counts
  let groupedElectionResults = await tabulateCastVoteRecords({
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
    const queryResult = tabulateManualResults({
      electionId,
      store,
      filter,
      groupBy,
    });

    // ignore manual results if the tabulation is not successful
    if (queryResult.isOk()) {
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
    }
  }

  return groupedElectionResults;
}

/**
 * Tabulates grouped tally reports for an election. This includes scanned results
 * adjusted with write-in adjudication data (but combining all unofficial write-ins)
 * and manual results separately.
 */
export async function tabulateTallyReportResults({
  electionId,
  store,
  filter = {},
  groupBy = {},
}: {
  electionId: Id;
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
}): Promise<Tabulation.GroupMap<TallyReportResults>> {
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));

  const groupedScannedResults = mapObject(
    await tabulateElectionResults({
      electionId,
      store,
      filter,
      groupBy,
      includeWriteInAdjudicationResults: true,
      includeManualResults: false,
    }),
    mergeWriteInTallies
  );
  const manualResultsTabulationResult = tabulateManualResults({
    electionId,
    store,
    filter,
    groupBy,
  });

  if (manualResultsTabulationResult.isErr()) {
    return mapObject(groupedScannedResults, (scannedResults) => ({
      scannedResults,
    }));
  }

  return mergeTabulationGroupMaps(
    groupedScannedResults,
    manualResultsTabulationResult.ok(),
    (scannedResults, manualResults) => {
      return {
        scannedResults:
          scannedResults ?? getEmptyElectionResults(election, true),
        manualResults: manualResults
          ? mergeWriteInTallies(manualResults)
          : undefined,
      };
    }
  );
}
