import {
  type BaseBallotProps,
  type Contest,
  type OptionalCandidateOrderings,
  getOrderedCandidates,
  getContests,
} from '@votingworks/types';

/**
 * Contests matching the ballot style in {@link props}, with any candidate
 * rotations and/or cross-endorsements applied.
 */
export function contestsForBallot(
  candidateOrderings: OptionalCandidateOrderings,
  props: BaseBallotProps
): Contest[] {
  const { election, ballotStyle } = props;

  return getContests({ ballotStyle, election }).map((contest) => {
    if (contest.type !== 'candidate') return contest;

    return {
      ...contest,
      candidates: getOrderedCandidates({
        contest,
        orderings: candidateOrderings,
      }),
    };
  });
}
