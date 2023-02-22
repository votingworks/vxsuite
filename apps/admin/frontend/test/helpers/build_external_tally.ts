import {
  BallotStyle,
  ContestTally,
  Election,
  ExternalTally,
  getContests,
} from '@votingworks/types';
import { assertDefined, mapValues, sum } from '@votingworks/basics';
import {
  getEmptyContestTallies,
  getTotalNumberOfBallots,
} from '../../src/utils/external_tallies';

function totalOptionVotes(contestTally: ContestTally) {
  return sum(
    Object.values(contestTally.tallies).map(
      (optionTally) => assertDefined(optionTally).tally
    )
  );
}

// Note this helper uses 'getEmptyContestTallies' and 'getTotalNumberOfBallots' util functions so should not be used to test those implementations.
export function buildExternalTally(
  election: Election,
  multiplier: number,
  ballotStyles: BallotStyle[]
): ExternalTally {
  // Initialize an empty set of contest tallies
  const contestTallies = getEmptyContestTallies(election);

  // Add tallies by ballot style, since when a voter cast a ballot, it will
  // impact the tally for every contest on that ballot
  for (const ballotStyle of ballotStyles) {
    const contests = getContests({ ballotStyle, election });

    // Compute the new option tallies we want to add to each contest in the
    // ballot style
    const newContestTallies = mapValues(
      contestTallies,
      (contestTally): ContestTally => {
        const { contest, tallies } = assertDefined(contestTally);
        const numSeats = contest.type === 'candidate' ? contest.seats : 1;
        const newTallies = mapValues(tallies, (optionTally) => ({
          option: assertDefined(optionTally).option,
          tally: assertDefined(optionTally).tally + 1 * multiplier * numSeats,
        }));
        return { ...assertDefined(contestTally), tallies: newTallies };
      }
    );

    // Figure out which contest had the most option votes added
    const maxOptionVotesForBallotStyle = Math.max(
      ...Object.values(newContestTallies).map(totalOptionVotes)
    );

    for (const contest of contests) {
      const contestTally = assertDefined(contestTallies[contest.id]);
      // Each contest in the ballot style should have the same number of
      // ballots cast, so we use the max option votes above to anchor the ballot
      // counts
      const numOptionVotes = totalOptionVotes(contestTally);
      const numOvervotes = 1 * multiplier;
      const numUndervotes =
        maxOptionVotesForBallotStyle - numOptionVotes + 1 * multiplier;
      const numBallots = numOptionVotes + numOvervotes + numUndervotes;
      contestTallies[contest.id] = {
        ...contestTally,
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
    numberOfBallotsCounted: assertDefined(
      getTotalNumberOfBallots(contestTallies, election)
    ),
  };
}
