import { iter } from '@votingworks/basics';
import {
  CandidateContest,
  Election,
  Vote,
  VotesDict,
  YesNoContest,
} from '@votingworks/types';

function generateMockCandidateVote(contest: CandidateContest, seed = 0): Vote {
  return iter(contest.candidates)
    .cycle()
    .skip(seed)
    .take(Math.min(contest.seats, contest.candidates.length))
    .toArray();
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
