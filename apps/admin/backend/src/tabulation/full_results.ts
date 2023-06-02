import { Tabulation } from '@votingworks/types';
import { tabulateCastVoteRecords } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { Store } from '../store';
import {
  modifyElectionResultsWithWriteInSummary,
  tabulateWriteInTallies,
} from './write_ins';

/**
 * Tabulate election results including all scanned and adjudicated information.
 */
export function tabulateElectionResults({
  store,
  filter = {},
  groupBy = {},
  includeWriteInAdjudicationResults,
}: {
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
  includeWriteInAdjudicationResults: boolean;
}): Tabulation.GroupedElectionResults {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const {
    electionDefinition: { election },
  } = electionRecord;

  const groupedElectionResults = tabulateCastVoteRecords({
    cvrs: store.getCastVoteRecords({ electionId, election, filter }),
    election,
    groupBy,
  });

  if (!includeWriteInAdjudicationResults) {
    return groupedElectionResults;
  }

  const groupedWriteInSummaries = tabulateWriteInTallies({
    election,
    writeInTallies: store.getWriteInTalliesForTabulation({
      electionId,
      election,
      filter,
      groupBy,
    }),
    groupBy,
  });

  for (const [
    groupKey,
    electionResultsWithoutWriteInAdjudicationData,
  ] of Object.entries(groupedElectionResults)) {
    const writeInSummary = groupedWriteInSummaries[groupKey];
    if (writeInSummary) {
      groupedElectionResults[groupKey] =
        modifyElectionResultsWithWriteInSummary(
          electionResultsWithoutWriteInAdjudicationData,
          writeInSummary
        );
    }
  }

  return groupedElectionResults;
}
