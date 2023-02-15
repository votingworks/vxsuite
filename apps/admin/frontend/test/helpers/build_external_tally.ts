import {
  ContestOptionTally,
  Dictionary,
  Election,
  ExternalTally,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import {
  getEmptyContestTallies,
  getTotalNumberOfBallots,
} from '../../src/utils/external_tallies';

// Note this helper uses 'getEmptyContestTallies' and 'getTotalNumberOfBallots' util functions so should not be used to test those implementations.
export function buildExternalTally(
  election: Election,
  multiplier: number,
  contestIdsToPopulate: string[]
): ExternalTally {
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
