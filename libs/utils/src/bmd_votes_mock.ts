import { assertDefined, iter } from '@votingworks/basics';
import {
  CandidateContest,
  Election,
  straightPartyNotYetImplemented,
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
  return [assertDefined(c.options[seed % c.options.length]).id];
}

export function generateMockVotes(election: Election): VotesDict {
  return Object.fromEntries(
    election.contests.map((c, index) => {
      // @coverage-exclude
      if (c.type === 'straight-party') {
        straightPartyNotYetImplemented();
      }
      return [
        c.id,
        c.type === 'yesno'
          ? generateMockYesNoVote(c, index)
          : generateMockCandidateVote(c, index),
      ];
    })
  );
}
