import {
  CandidateContest,
  MarkStatus,
  MarkThresholds,
  MsEitherNeitherContest,
  TargetShape,
  YesNoContest,
} from '@votingworks/types';

import { optionMarkStatus } from './option_mark_status';

import { election } from '../../test/fixtures/state-of-hamilton';
import { election as eitherNeitherElection } from '../../test/fixtures/choctaw-mock-general-election-2020';

const markThresholds: MarkThresholds = {
  definite: 0.17,
  marginal: 0.17,
  writeInText: 0.01,
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
    contests: election.contests,
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

  expect(result).toBe(MarkStatus.Marked);

  const emptyResult = optionMarkStatus({
    contests: election.contests,
    markThresholds,
    marks: [],
    contestId: contest.id,
    optionId: 'yes',
  });

  expect(emptyResult).toBe(MarkStatus.Unmarked);
});

test('a candidate mark', () => {
  const contest = election.contests.find(
    (c) => c.type === 'candidate'
  ) as CandidateContest;
  const result = optionMarkStatus({
    contests: election.contests,
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

  expect(result).toBe(MarkStatus.Marked);

  const emptyResult = optionMarkStatus({
    contests: election.contests,
    markThresholds,
    marks: [],
    contestId: contest.id,
    optionId: contest.candidates[2].id,
  });

  expect(emptyResult).toBe(MarkStatus.Unmarked);
});

test('a candidate write-in mark', () => {
  const contest = election.contests.find(
    (c) => c.type === 'candidate' && c.allowWriteIns
  ) as CandidateContest;
  const optionId = 'write-in-0';
  const result = optionMarkStatus({
    contests: election.contests,
    markThresholds,
    marks: [
      {
        type: 'candidate',
        bounds: defaultShape.bounds,
        contestId: contest.id,
        target: defaultShape,
        optionId,
        score: 0,
        scoredOffset: { x: 0, y: 0 },
        writeInTextScore: 0.05,
      },
    ],
    contestId: contest.id,
    optionId,
  });

  expect(result).toBe(MarkStatus.UnmarkedWriteIn);
});

test('a ms-either-neither mark', () => {
  const contest = eitherNeitherElection.contests.find(
    (c) => c.type === 'ms-either-neither'
  ) as MsEitherNeitherContest;
  const eitherResult = optionMarkStatus({
    contests: eitherNeitherElection.contests,
    markThresholds,
    marks: [
      {
        type: 'ms-either-neither',
        bounds: defaultShape.bounds,
        contestId: contest.id,
        target: defaultShape,
        optionId: contest.neitherOption.id,
        score: 0.5,
        scoredOffset: { x: 1, y: 1 },
      },
    ],
    contestId: contest.eitherNeitherContestId,
    optionId: 'no',
  });

  expect(eitherResult).toBe(MarkStatus.Marked);

  const pickOneResult = optionMarkStatus({
    contests: eitherNeitherElection.contests,
    markThresholds,
    marks: [
      {
        type: 'ms-either-neither',
        bounds: defaultShape.bounds,
        contestId: contest.id,
        target: defaultShape,
        optionId: contest.firstOption.id,
        score: 0.5,
        scoredOffset: { x: 1, y: 1 },
      },
    ],
    contestId: contest.pickOneContestId,
    optionId: 'yes',
  });

  expect(pickOneResult).toBe(MarkStatus.Marked);

  const emptyResult = optionMarkStatus({
    contests: eitherNeitherElection.contests,
    markThresholds,
    marks: [],
    contestId: contest.id,
    optionId: 'yes',
  });

  expect(emptyResult).toBe(MarkStatus.Unmarked);
});
