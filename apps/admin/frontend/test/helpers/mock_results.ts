import {
  CardCountsByParty,
  TallyReportResults,
} from '@votingworks/admin-backend';
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
      bmd: ballotCount,
      hmpb: [],
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

export function getSimpleMockTallyResults({
  election,
  scannedBallotCount,
  manualBallotCount,
  cardCountsByParty,
  contestIds: specifiedContestIds,
}: {
  election: Election;
  scannedBallotCount: number;
  manualBallotCount?: number;
  cardCountsByParty?: CardCountsByParty;
  contestIds?: string[];
}): TallyReportResults {
  const scannedResults = getSimpleMockElectionResults(
    election,
    scannedBallotCount
  );
  const manualResults =
    manualBallotCount !== undefined
      ? getSimpleMockManualResults(election, manualBallotCount)
      : undefined;
  const contestIds = specifiedContestIds ?? election.contests.map((c) => c.id);

  if (cardCountsByParty) {
    return {
      scannedResults,
      manualResults,
      contestIds,
      hasPartySplits: true,
      cardCountsByParty,
    };
  }

  return {
    scannedResults,
    manualResults,
    contestIds,
    hasPartySplits: false,
    cardCounts: scannedResults.cardCounts,
  };
}

export function getMockCardCounts(
  bmd: number,
  manual?: number,
  ...hmpb: number[]
): Tabulation.CardCounts {
  return {
    bmd,
    manual,
    hmpb,
  };
}
