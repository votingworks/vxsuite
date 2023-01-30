import {
  BallotMark,
  CandidateContest,
  MsEitherNeitherContest,
  YesNoContest,
} from '@votingworks/types';
import { find } from '@votingworks/basics';
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
  contestId: candidateContest.id,
  optionId: candidateContest.candidates[0].id,
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
  contestId: yesnoContest.id,
  optionId: 'yes',
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
  contestId: msEitherNeitherContest.id,
  optionId: msEitherNeitherContest.eitherOption.id,
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
    getVotesFromMarks(election, [candidateMark], {
      markScoreVoteThreshold: 0.12,
    })
  ).toEqual({
    [candidateContest.id]: [
      expect.objectContaining({ id: candidateMark.optionId }),
    ],
  });
  expect(
    getVotesFromMarks(election, [candidateMark], {
      markScoreVoteThreshold: 0.6,
    })
  ).toEqual({});
});

test('yesno contest', () => {
  expect(
    getVotesFromMarks(election, [yesnoMark], { markScoreVoteThreshold: 0.12 })
  ).toEqual({
    [yesnoContest.id]: ['yes'],
  });
  expect(
    getVotesFromMarks(election, [yesnoMark], { markScoreVoteThreshold: 0.6 })
  ).toEqual({});
});

test('ms-either-neither contest', () => {
  expect(
    getVotesFromMarks(election, [msEitherNeitherMark], {
      markScoreVoteThreshold: 0.12,
    })
  ).toEqual({
    [msEitherNeitherContest.eitherNeitherContestId]: ['yes'],
  });
  expect(
    getVotesFromMarks(election, [msEitherNeitherMark], {
      markScoreVoteThreshold: 0.6,
    })
  ).toEqual({});
});
