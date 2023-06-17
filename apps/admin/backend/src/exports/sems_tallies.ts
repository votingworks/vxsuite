import { Tabulation } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { groupMapToGroupList } from '@votingworks/utils';
import {
  SemsExportableContestTally,
  SemsExportableTallies,
  SemsExportableTally,
} from '../types';

function convertElectionResultsToSemsExportableTally(
  electionResults: Tabulation.ElectionResults
): SemsExportableTally {
  const tally: SemsExportableTally = {};
  for (const [contestId, contestResults] of Object.entries(
    electionResults.contestResults
  )) {
    const counts: SemsExportableContestTally['tallies'] = {};
    if (contestResults.contestType === 'yesno') {
      counts['yes'] = contestResults.yesTally;
      counts['no'] = contestResults.noTally;
    } else {
      for (const [candidateId, candidateTally] of Object.entries(
        contestResults.tallies
      )) {
        counts[candidateId] = candidateTally.tally;
      }
    }

    tally[contestId] = {
      tallies: counts,
      metadata: {
        ballots: contestResults.ballots,
        overvotes: contestResults.overvotes,
        undervotes: contestResults.undervotes,
      },
    };
  }

  return tally;
}

/**
 * Formats election results grouped by precinct to the format required by the SEMS converter.
 */
export function getSemsExportableTallies(
  electionResultsByPrecinct: Tabulation.ElectionResultsGroupMap
): SemsExportableTallies {
  const talliesByPrecinct: SemsExportableTallies['talliesByPrecinct'] = {};
  const electionResultsList = groupMapToGroupList(electionResultsByPrecinct);
  for (const electionResults of electionResultsList) {
    assert(electionResults.precinctId !== undefined);
    const { precinctId } = electionResults;
    talliesByPrecinct[precinctId] =
      convertElectionResultsToSemsExportableTally(electionResults);
  }

  return {
    talliesByPrecinct,
  };
}
