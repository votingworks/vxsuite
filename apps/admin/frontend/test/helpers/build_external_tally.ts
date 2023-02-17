import {
  BallotStyle,
  CandidateContest,
  ContestOptionTally,
  Dictionary,
  Election,
  ExternalTally,
  getBallotStyle,
  getContests,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import {
  getEmptyContestTallies,
  getTotalNumberOfBallots,
} from '../../src/utils/external_tallies';

// Note this helper uses 'getEmptyContestTallies' and 'getTotalNumberOfBallots' util functions so should not be used to test those implementations.
export function buildExternalTally(
  election: Election,
  multiplier: number,
  ballotStyles: BallotStyle[]
): ExternalTally {
  // Initialize an empty set of contest tallies
  const contestTallies = getEmptyContestTallies(election);
  for (const ballotStyle of ballotStyles) {
    const contests = getContests({ ballotStyle, election });
    const maxContestOptions = Math.max(
      ...contests.map(
        (contest) =>
          Object.keys(assertDefined(contestTallies[contest.id]).tallies).length
      )
    );
    const numBallots = (2 + maxContestOptions) * multiplier;
    for (const contest of contests) {
      const contestTally = contestTallies[contest.id];
      assert(contestTally);
      const populatedTallies: Dictionary<ContestOptionTally> = {};
      const numSeats = contest.type === 'candidate' ? contest.seats : 1;
      const optionIds = Object.keys(contestTally.tallies);
      for (const optionId of optionIds) {
        const option = contestTally.tallies[optionId];
        assert(option);
        populatedTallies[optionId] = {
          ...option,
          tally: option.tally + 1 * multiplier * numSeats,
        };
      }
      const numOptionVotes = optionIds.length * multiplier * numSeats;
      const numOvervotes = 1 * multiplier * numSeats;
      const numUndervotes = numBallots - numOptionVotes - numOvervotes;
      contestTallies[contest.id] = {
        ...contestTally,
        tallies: populatedTallies,
        metadata: {
          undervotes: contestTally.metadata.undervotes + numUndervotes,
          overvotes: contestTally.metadata.overvotes + numOvervotes,
          ballots: contestTally.metadata.ballots + numBallots,
        },
      };
    }
  }
  return {
    contestTallies,
    numberOfBallotsCounted: getTotalNumberOfBallots(contestTallies, election),
  };
}
