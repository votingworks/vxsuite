import sample from 'lodash.sample';
import sampleSize from 'lodash.samplesize';

import { assertDefined } from '@votingworks/basics';
import {
  Candidate,
  CandidateContest,
  Vote,
  YesNoContest,
} from '@votingworks/types';

export function generateCandidateVotes(contest: CandidateContest): Vote {
  if (contest.seats === 1) {
    return sampleSize(contest.candidates, 1);
  }

  const votes: Candidate[] = [];

  // Leave room for write-in candidate and undervote:
  const numRegularCandidates = contest.seats - 2;
  votes.push(...sampleSize(contest.candidates, numRegularCandidates));

  votes.push({
    id: 'write-in',
    name: 'PRINCESS FIONA',
    isWriteIn: true,
  });

  return votes;
}

export function generateYesNoVote(c: YesNoContest): Vote {
  /* istanbul ignore next */
  if (Math.random() < 0.25) {
    return [] as Vote;
  }

  return [assertDefined(sample([c.yesOption.id, c.noOption.id]))] as Vote;
}
