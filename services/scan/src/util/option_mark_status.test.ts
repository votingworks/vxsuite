import {
  CandidateContest,
  MarkStatus,
  MarkThresholds,
  TargetShape,
  YesNoContest,
} from '@votingworks/types';

import { optionMarkStatus } from './option_mark_status';

import { election } from '../../test/fixtures/state-of-hamilton';

const markThresholds: MarkThresholds = {
  definite: 0.17,
  marginal: 0.17,
};
const defaultShape: TargetShape = {
  bounds: { x: 0, y: 0, width: 10, height: 10 },
  inner: { x: 0, y: 0, width: 10, height: 10 },
};

test('a yesno mark', () => {
  const contest = election.contests.find(
    (c) => c.type === 'yesno'
  ) as YesNoContest;
  const result = optionMarkStatus({
    markThresholds,
    marks: [
      {
        type: 'yesno',
        bounds: defaultShape.bounds,
        contestId: contest.id,
        target: defaultShape,
        optionId: 'yes',
        score: 0.5,
        scoredOffset: { x: 1, y: 1 },
      },
    ],
    contestId: contest.id,
    optionId: 'yes',
  });

  expect(result).toEqual(MarkStatus.Marked);

  const emptyResult = optionMarkStatus({
    markThresholds,
    marks: [],
    contestId: contest.id,
    optionId: 'yes',
  });

  expect(emptyResult).toEqual(MarkStatus.Unmarked);
});

test('a candidate mark', () => {
  const contest = election.contests.find(
    (c) => c.type === 'candidate'
  ) as CandidateContest;
  const result = optionMarkStatus({
    markThresholds,
    marks: [
      {
        type: 'candidate',
        bounds: defaultShape.bounds,
        contestId: contest.id,
        target: defaultShape,
        optionId: contest.candidates[2].id,
        score: 0.5,
        scoredOffset: { x: 1, y: 1 },
      },
    ],
    contestId: contest.id,
    optionId: contest.candidates[2].id,
  });

  expect(result).toEqual(MarkStatus.Marked);

  const emptyResult = optionMarkStatus({
    markThresholds,
    marks: [],
    contestId: contest.id,
    optionId: contest.candidates[2].id,
  });

  expect(emptyResult).toEqual(MarkStatus.Unmarked);
});
