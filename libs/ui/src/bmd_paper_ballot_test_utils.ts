import _ from 'lodash';

import { assertDefined } from '@votingworks/basics';
import {
  Candidate,
  CandidateContest,
  Vote,
  YesNoContest,
} from '@votingworks/types';

export function generateCandidateVotes(contest: CandidateContest): Vote {
  if (contest.seats === 1) {
    return _.sampleSize(contest.candidates, 1);
  }

  const votes: Candidate[] = [];

  // Leave room for write-in candidate and undervote:
  const numRegularCandidates = contest.seats - 2;
  votes.push(..._.sampleSize(contest.candidates, numRegularCandidates));

  votes.push({
    id: 'write-in',
    name: 'PRINCESS FIONA',
    isWriteIn: true,
  });

  return votes;
}

export function generateYesNoVote(c: YesNoContest): Vote {
  if (Math.random() < 0.25) {
    return [] as Vote;
  }

  return [assertDefined(_.sample([c.yesOption.id, c.noOption.id]))] as Vote;
}
