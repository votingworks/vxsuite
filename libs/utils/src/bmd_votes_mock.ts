import { assert } from '@votingworks/basics';
import {
  Candidate,
  CandidateContest,
  Election,
  Vote,
  VotesDict,
  YesNoContest,
} from '@votingworks/types';

function generateMockCandidateVote(contest: CandidateContest, seed = 0): Vote {
  const votes: Candidate[] = [];

  for (let i = 0; i < contest.seats && i < contest.candidates.length; i += 1) {
    const candidate =
      contest.candidates[(i + seed) % contest.candidates.length];
    assert(candidate);
    votes.push(candidate);
  }

  return votes;
}

function generateMockYesNoVote(c: YesNoContest, seed = 0): Vote {
  if (seed % 2 === 0) {
    return [c.yesOption.id];
  }

  return [c.noOption.id];
}

export function generateMockVotes(election: Election): VotesDict {
  return Object.fromEntries(
    election.contests.map((c, index) => [
      c.id,
      c.type === 'yesno'
        ? generateMockYesNoVote(c, index)
        : generateMockCandidateVote(c, index),
    ])
  );
}
