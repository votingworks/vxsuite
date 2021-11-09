import { Candidate, CandidateContest, CandidateVote } from '@votingworks/types';

export function rotateArrayByLength<T>(
  array: readonly T[],
  length: number
): T[] {
  const a = [...array];
  return a.concat(a.splice(0, (length < 0 ? 0 : length) % a.length));
}

export function getContestCandidatesInRotatedOrder({
  contest,
  precinctIndex,
}: {
  contest: CandidateContest;
  precinctIndex: number;
}): readonly Candidate[] {
  if (contest.rotation?.type === 'candidateShiftByPrecinctIndex') {
    return rotateArrayByLength(contest.candidates, precinctIndex);
  }
  return contest.candidates;
}

export function getContestVoteInRotatedOrder({
  contest,
  vote,
  precinctIndex,
}: {
  contest: CandidateContest;
  vote: CandidateVote;
  precinctIndex: number;
}): CandidateVote {
  const sortedCandidates = getContestCandidatesInRotatedOrder({
    contest,
    precinctIndex,
  });
  const candidateVotes = vote
    .filter((v) => !v.isWriteIn)
    .sort(
      (a, b) =>
        sortedCandidates.findIndex((c) => c.id === a.id) -
        sortedCandidates.findIndex((c) => c.id === b.id)
    );
  const writeInVotes = vote.filter((v) => v.isWriteIn);
  return [...candidateVotes, ...writeInVotes];
}
