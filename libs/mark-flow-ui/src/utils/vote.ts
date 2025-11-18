import { uniqueBy } from '@votingworks/basics';
import { CandidateContest, CandidateVote } from '@votingworks/types';

/*
 * Returns two values, first the number of votes remaining in the contest that are currently uncast. If the vote is overvoted this value will be 0.
 * The second value is the number of votes exceeding the allowed number of votes in the contest, in the case of an overvote. If not overvoted this value will be 0.
 *
 * If the vote includes votes for multiple options of a multi-endorsed candidate, this function will count each all options as a single vote.
 */
export function numVotesRemainingAndExceeding(
  contest: CandidateContest,
  vote: CandidateVote
): [number, number] {
  const uniqueVoteIds = uniqueBy([...vote], (c) => c.id);
  const votesRemaining = contest.seats - uniqueVoteIds.length;
  const votesExceeding = Math.max(0, -votesRemaining);
  return [Math.max(0, votesRemaining), votesExceeding];
}
