import { throwIllegalValue } from '@votingworks/basics';
import { ContestVote, ContestVotes, ElectionADT } from '@votingworks/types';
import { findById } from '@votingworks/types/src/election_adt';

/**
 * Helper function to build a `VotesDict` more easily, primarily for testing.
 *
 * @param contests The contests the voter voted in, probably from `getContests`.
 * @param shorthand A mapping of contest id to "vote", where a vote can be the
 * string id of a candidate, multiple string ids for candidates, or just a
 * `ContestVote` by itself.
 *
 * @example
 *
 * // Vote by candidate id.
 * buildVotes(contests, { president: 'boone-lian' })
 *
 * // Vote for a ballot measure.
 * buildVotes(contests, { 'question-a': 'yes' })
 *
 * // Multiple votes.
 * buildVotes(contests, {
 *   president: 'boone-lian',
 *   'question-a': 'yes'
 * })
 *
 * // Multiple candidate selections.
 * buildVotes(contests, {
 *   'city-council': ['rupp', 'davis']
 * })
 */
export function buildVotes(
  contests: readonly ElectionADT.Contest[],
  shorthand: {
    [key: string]: string | readonly string[] | ContestVote;
  }
): ContestVotes {
  return Object.getOwnPropertyNames(shorthand).reduce<ContestVotes>(
    // eslint-disable-next-line array-callback-return
    (result, contestId): ContestVotes => {
      const contest = findById(contests, contestId);
      const choice = shorthand[contestId];

      if (contest.type === 'ballot-measure') {
        const optionIds = (
          Array.isArray(choice) ? choice : [choice]
        ) as string[];
        return {
          ...result,
          [contestId]: optionIds.map((optionId) => ({ optionId })),
        };
      }
      if (contest.type === 'candidate') {
        if (Array.isArray(choice)) {
          if (typeof choice[0] === 'string') {
            return {
              ...result,
              [contestId]: choice.map((candidateId) => ({
                isWriteIn: false,
                candidateId: candidateId as unknown as string,
              })),
            };
          }
          if (typeof choice[0] === 'object') {
            return {
              ...result,
              [contestId]: choice as ContestVote,
            };
          }
        }

        if (typeof choice === 'string') {
          return {
            ...result,
            [contestId]: [
              {
                isWriteIn: false,
                candidateId: choice,
              },
            ],
          };
        }

        return result;
      }
      throwIllegalValue(contest);
    },
    {}
  );
}
