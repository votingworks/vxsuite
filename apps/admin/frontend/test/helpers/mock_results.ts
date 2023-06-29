import { TallyReportResults } from '@votingworks/admin-backend';
import { Election, Tabulation } from '@votingworks/types';
import {
  ContestResultsSummaries,
  buildElectionResultsFixture,
} from '@votingworks/utils';

/**
 * To quickly mock data for tally reports. Simply takes the top-level ballot count and
 * assumes that ballot count applies to every contest, all undervotes.
 */
export function getSimpleMockElectionResults(
  election: Election,
  ballotCount: number
): Tabulation.ElectionResults {
  const contestResultsSummaries: ContestResultsSummaries = {};
  for (const contest of election.contests) {
    contestResultsSummaries[contest.id] = {
      type: contest.type === 'candidate' ? 'candidate' : 'yesno',
      ballots: ballotCount,
      undervotes:
        contest.type === 'candidate'
          ? ballotCount * contest.seats
          : ballotCount,
      overvotes: 0,
    };
  }
  return buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: 0,
      hmpb: [ballotCount],
    },
    contestResultsSummaries,
    includeGenericWriteIn: true,
  });
}

export function getSimpleMockManualResults(
  election: Election,
  ballotCount: number
): Tabulation.ManualElectionResults {
  return {
    ballotCount,
    ...getSimpleMockElectionResults(election, ballotCount),
  };
}

export function getSimpleMockTallyResults(
  election: Election,
  scannedBallotCount: number,
  manualBallotCount?: number
): TallyReportResults {
  return {
    scannedResults: getSimpleMockElectionResults(election, scannedBallotCount),
    manualResults:
      manualBallotCount !== undefined
        ? getSimpleMockManualResults(election, manualBallotCount)
        : undefined,
  };
}
