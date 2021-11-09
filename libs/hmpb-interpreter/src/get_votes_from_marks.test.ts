import {
  BallotMark,
  CandidateContest,
  MsEitherNeitherContest,
  YesNoContest,
} from '@votingworks/types';
import { find } from '@votingworks/utils';
import { election } from '../test/fixtures/choctaw-county-2020-general-election';
import { getVotesFromMarks } from './get_votes_from_marks';

const candidateContest = find(
  election.contests,
  (c): c is CandidateContest => c.type === 'candidate'
);

const yesnoContest = find(
  election.contests,
  (c): c is YesNoContest => c.type === 'yesno'
);

const msEitherNeitherContest = find(
  election.contests,
  (c): c is MsEitherNeitherContest => c.type === 'ms-either-neither'
);

const candidateMark: BallotMark = {
  type: 'candidate',
  contest: candidateContest,
  option: candidateContest.candidates[0],
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  score: 0.2,
  scoredOffset: { x: 0, y: 0 },
  target: {
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    inner: { x: 0, y: 0, width: 0, height: 0 },
  },
};

const yesnoMark: BallotMark = {
  type: 'yesno',
  contest: yesnoContest,
  option: 'yes',
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  score: 0.2,
  scoredOffset: { x: 0, y: 0 },
  target: {
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    inner: { x: 0, y: 0, width: 0, height: 0 },
  },
};

const msEitherNeitherMark: BallotMark = {
  type: 'ms-either-neither',
  contest: msEitherNeitherContest,
  option: msEitherNeitherContest.eitherOption,
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  score: 0.2,
  scoredOffset: { x: 0, y: 0 },
  target: {
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    inner: { x: 0, y: 0, width: 0, height: 0 },
  },
};

test('candidate contest', () => {
  expect(
    getVotesFromMarks([candidateMark], { markScoreVoteThreshold: 0.12 })
  ).toEqual({
    [candidateContest.id]: [candidateMark.option],
  });
  expect(
    getVotesFromMarks([candidateMark], { markScoreVoteThreshold: 0.6 })
  ).toEqual({});
});

test('yesno contest', () => {
  expect(
    getVotesFromMarks([yesnoMark], { markScoreVoteThreshold: 0.12 })
  ).toEqual({
    [yesnoContest.id]: [yesnoMark.option],
  });
  expect(
    getVotesFromMarks([yesnoMark], { markScoreVoteThreshold: 0.6 })
  ).toEqual({});
});

test('ms-either-neither contest', () => {
  expect(
    getVotesFromMarks([msEitherNeitherMark], { markScoreVoteThreshold: 0.12 })
  ).toEqual({
    [msEitherNeitherContest.eitherNeitherContestId]: [yesnoMark.option],
  });
  expect(
    getVotesFromMarks([msEitherNeitherMark], { markScoreVoteThreshold: 0.6 })
  ).toEqual({});
});

test('stray marks', () => {
  expect(() =>
    getVotesFromMarks(
      [{ type: 'stray', bounds: { x: 0, y: 0, width: 0, height: 0 } }],
      { markScoreVoteThreshold: 0.12 }
    )
  ).toThrowError("mark type 'stray' is not yet supported");
});
