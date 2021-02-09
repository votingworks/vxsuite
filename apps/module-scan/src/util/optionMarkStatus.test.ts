import {
  MarkThresholds,
  YesNoContest,
  CandidateContest,
  MsEitherNeitherContest,
} from '@votingworks/types'

import { MarkStatus } from '../types/ballot-review'

import optionMarkStatus from './optionMarkStatus'

import election from '../../test/fixtures/state-of-hamilton/election'
import eitherNeitherElection from '../../test/fixtures/choctaw-mock-general-election-2020/election'

const markThresholds: MarkThresholds = { definite: 0.17, marginal: 0.17 }
const defaultShape = {
  bounds: { x: 0, y: 0, width: 10, height: 10 },
  inner: { x: 0, y: 0, width: 10, height: 10 },
}

test('a yesno mark', () => {
  const contest = election.contests.find(
    (c) => c.type === 'yesno'
  ) as YesNoContest
  const result = optionMarkStatus({
    markThresholds,
    marks: [
      {
        type: 'yesno',
        bounds: defaultShape.bounds,
        contest,
        target: defaultShape,
        option: 'yes',
        score: 0.5,
        scoredOffset: { x: 1, y: 1 },
      },
    ],
    contestId: contest.id,
    optionId: 'yes',
  })

  expect(result).toBe(MarkStatus.Marked)

  const emptyResult = optionMarkStatus({
    markThresholds,
    marks: [],
    contestId: contest.id,
    optionId: 'yes',
  })

  expect(emptyResult).toBe(MarkStatus.Unmarked)
})

test('a candidate mark', () => {
  const contest = election.contests.find(
    (c) => c.type === 'candidate'
  ) as CandidateContest
  const result = optionMarkStatus({
    markThresholds,
    marks: [
      {
        type: 'candidate',
        bounds: defaultShape.bounds,
        contest,
        target: defaultShape,
        option: contest.candidates[2],
        score: 0.5,
        scoredOffset: { x: 1, y: 1 },
      },
    ],
    contestId: contest.id,
    optionId: contest.candidates[2].id,
  })

  expect(result).toBe(MarkStatus.Marked)

  const emptyResult = optionMarkStatus({
    markThresholds,
    marks: [],
    contestId: contest.id,
    optionId: contest.candidates[2].id,
  })

  expect(emptyResult).toBe(MarkStatus.Unmarked)
})

test('a ms-either-neither mark', () => {
  const contest = eitherNeitherElection.contests.find(
    (c) => c.type === 'ms-either-neither'
  ) as MsEitherNeitherContest
  const eitherResult = optionMarkStatus({
    markThresholds,
    marks: [
      {
        type: 'ms-either-neither',
        bounds: defaultShape.bounds,
        contest,
        target: defaultShape,
        option: contest.neitherOption,
        score: 0.5,
        scoredOffset: { x: 1, y: 1 },
      },
    ],
    contestId: contest.eitherNeitherContestId,
    optionId: 'no',
  })

  expect(eitherResult).toBe(MarkStatus.Marked)

  const pickOneResult = optionMarkStatus({
    markThresholds,
    marks: [
      {
        type: 'ms-either-neither',
        bounds: defaultShape.bounds,
        contest,
        target: defaultShape,
        option: contest.firstOption,
        score: 0.5,
        scoredOffset: { x: 1, y: 1 },
      },
    ],
    contestId: contest.pickOneContestId,
    optionId: 'yes',
  })

  expect(pickOneResult).toBe(MarkStatus.Marked)

  const emptyResult = optionMarkStatus({
    markThresholds,
    marks: [],
    contestId: contest.id,
    optionId: 'yes',
  })

  expect(emptyResult).toBe(MarkStatus.Unmarked)
})
