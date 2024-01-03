import { Admin, Election, Tabulation } from '@votingworks/types';
import { mapObject } from '@votingworks/basics';
import {
  ContestResultsSummaries,
  buildElectionResultsFixture,
} from './tabulation';

function buildSimpleMockElectionResults(
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

function buildSimpleMockManualResults(
  election: Election,
  ballotCount: number
): Tabulation.ManualElectionResults {
  return {
    ballotCount,
    ...buildSimpleMockElectionResults(election, ballotCount),
  };
}

/**
 * To quickly mock data for tally reports. Simply takes the top-level ballot count and
 * assumes that ballot count applies to every contest, all undervotes.
 */
export function buildSimpleMockTallyReportResults({
  election,
  scannedBallotCount,
  manualBallotCount,
  cardCountsByParty,
  contestIds: specifiedContestIds,
}: {
  election: Election;
  scannedBallotCount: number;
  manualBallotCount?: number;
  cardCountsByParty?: Record<string, number | Tabulation.CardCounts>;
  contestIds?: string[];
}): Admin.TallyReportResults {
  const scannedResults = buildSimpleMockElectionResults(
    election,
    scannedBallotCount
  );
  const manualResults =
    manualBallotCount !== undefined
      ? buildSimpleMockManualResults(election, manualBallotCount)
      : undefined;
  const contestIds = specifiedContestIds ?? election.contests.map((c) => c.id);

  if (election.type === 'primary') {
    return {
      scannedResults,
      manualResults,
      contestIds,
      hasPartySplits: true,
      cardCountsByParty: mapObject(cardCountsByParty ?? {}, (count) => {
        if (typeof count === 'number') {
          return {
            bmd: count,
            hmpb: [],
          };
        }
        return count;
      }),
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

export function buildMockCardCounts(
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
