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
  // 25% chance of no vote, otherwise a random option
  const optionId = assertDefined(sample(c.options.map((option) => option.id)));
  const choices: Vote[] = [[], [optionId], [optionId], [optionId]];
  return assertDefined(sample(choices));
}
