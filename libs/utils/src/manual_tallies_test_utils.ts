import {
  Candidate,
  ContestId,
  ContestOptionId,
  ContestOptionTally,
  Dictionary,
  Election,
  Id,
  ManualTally,
  CandidateContest,
  BallotStyle,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import {
  getEmptyContestTallies,
  getTotalNumberOfBallots,
} from './manual_tallies';

export function buildCandidateTallies(
  multiplier: number,
  contest: CandidateContest
): Dictionary<ContestOptionTally> {
  const results: Dictionary<ContestOptionTally> = {};
  let index = 0;
  for (const c of contest.candidates) {
    results[c.id] = {
      option: c,
      tally: index * multiplier,
    };
    index += 1;
  }
  return results;
}

export function getMockManualTally(
  props: Partial<ManualTally> = {}
): ManualTally {
  return {
    numberOfBallotsCounted: 0,
    contestTallies: {},
    ...props,
  };
}

/**
 * Note this helper uses 'getEmptyContestTallies' and 'getTotalNumberOfBallots'
 * util functions so should not be used to test those implementations.
 *
 * Builds a tally with even amounts of votes for each option.
 */
export function buildManualTally(
  election: Election,
  multiplier: number,
  contestIdsToPopulate: string[]
): ManualTally {
  // Initialize an empty set of contest tallies
  const contestTallies = getEmptyContestTallies(election);
  for (const contestId of contestIdsToPopulate) {
    if (!(contestId in contestTallies)) {
      throw new Error(
        `Contest ID ${contestId} is not in the provided election`
      );
    }
    const emptyTally = contestTallies[contestId];
    assert(emptyTally);
    const populatedTallies: Dictionary<ContestOptionTally> = {};
    const numSeats =
      emptyTally.contest.type === 'candidate' ? emptyTally.contest.seats : 1;
    let numberOfBallotsInContest = 2 * multiplier; // Undervotes and Overvotes
    for (const optionId of Object.keys(emptyTally.tallies)) {
      const option = emptyTally.tallies[optionId];
      assert(option);
      populatedTallies[optionId] = {
        ...option,
        tally: 1 * multiplier * numSeats,
      };
      numberOfBallotsInContest += 1 * multiplier;
    }
    contestTallies[contestId] = {
      ...emptyTally,
      tallies: populatedTallies,
      metadata: {
        undervotes: 1 * multiplier * numSeats,
        overvotes: 1 * multiplier * numSeats,
        ballots: numberOfBallotsInContest,
      },
    };
  }
  return {
    contestTallies,
    numberOfBallotsCounted: getTotalNumberOfBallots(contestTallies, election),
  };
}

/**
 * Build a manual tally with the specified metadata and tallies.
 */
export function buildSpecificManualTally(
  election: Election,
  numberOfBallotsCounted: number,
  contestTallySummaries: Record<
    ContestId,
    {
      overvotes?: number;
      undervotes?: number;
      ballots: number;
      officialOptionTallies?: Record<ContestOptionId, number>;
      writeInOptionTallies?: Record<
        Id,
        {
          candidate: Candidate;
          count: number;
        }
      >;
    }
  >,
  ballotStyle?: BallotStyle
): ManualTally {
  // Initialize an empty set of contest tallies
  const contestTallies = getEmptyContestTallies(election, ballotStyle);
  for (const [contestId, tallySummary] of Object.entries(
    contestTallySummaries
  )) {
    if (!(contestId in contestTallies)) {
      throw new Error(
        `Contest ID ${contestId} is not in the provided election`
      );
    }
    const emptyTally = contestTallies[contestId];
    assert(emptyTally);
    const populatedTallies: Dictionary<ContestOptionTally> = {};

    // add official candidate vote counts to existing option tallies
    for (const optionId of Object.keys(emptyTally.tallies)) {
      const optionTally = emptyTally.tallies[optionId];
      assert(optionTally);
      populatedTallies[optionId] = {
        ...optionTally,
        tally: tallySummary.officialOptionTallies?.[optionId] ?? 0,
      };
    }

    // add write-in candidate option tallies if specified
    if (tallySummary.writeInOptionTallies) {
      for (const [candidateId, { candidate, count }] of Object.entries(
        tallySummary.writeInOptionTallies
      )) {
        populatedTallies[candidateId] = {
          option: candidate,
          tally: count,
        };
      }
    }

    contestTallies[contestId] = {
      ...emptyTally,
      tallies: populatedTallies,
      metadata: {
        undervotes: tallySummary.undervotes ?? 0,
        overvotes: tallySummary.overvotes ?? 0,
        ballots: tallySummary.ballots,
      },
    };
  }
  return {
    contestTallies,
    numberOfBallotsCounted,
  };
}
