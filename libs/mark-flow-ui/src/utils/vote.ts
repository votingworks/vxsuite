import { uniqueBy } from '@votingworks/basics';
import { CandidateContest, CandidateVote } from '@votingworks/types';

export function numVotesRemaining(
  contest: CandidateContest,
  vote: CandidateVote
): number {
  const uniqueVoteIds = uniqueBy([...vote], (c) => c.id);
  return contest.seats - uniqueVoteIds.length;
}
