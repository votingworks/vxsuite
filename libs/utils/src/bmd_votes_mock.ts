import { assertDefined, iter } from '@votingworks/basics';
import {
  CandidateContest,
  Election,
  straightPartyNotYetImplemented,
  Vote,
  VotesDict,
  BallotMeasureContest,
} from '@votingworks/types';

function generateMockCandidateVote(contest: CandidateContest, seed = 0): Vote {
  return iter(contest.candidates)
    .cycle()
    .skip(seed)
    .take(Math.min(contest.seats, contest.candidates.length))
    .toArray();
}

function generateMockBallotMeasureVote(
  c: BallotMeasureContest,
  seed = 0
): Vote {
  if (seed % 2 === 0) {
    return [assertDefined(c.options[0]).id];
  }

  return [assertDefined(c.options[1]).id];
}

export function generateMockVotes(election: Election): VotesDict {
  return Object.fromEntries(
    election.contests.map((c, index) => {
      /* istanbul ignore next */
      if (c.type === 'straight-party') {
        straightPartyNotYetImplemented();
      }
      return [
        c.id,
        c.type === 'measure'
          ? generateMockBallotMeasureVote(c, index)
          : generateMockCandidateVote(c, index),
      ];
    })
  );
}
