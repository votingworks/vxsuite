import {
  CandidateContest,
  electionSample,
  YesNoContest,
} from '@votingworks/ballot-encoder'
import zeroRect from '../../test/fixtures/zeroRect'
import applyChangesToMarks from './applyChangesToMarks'

test('returns an empty object when no changes are given', () => {
  const candidateContest = electionSample.contests.find(
    ({ type }) => type === 'candidate'
  ) as CandidateContest
  const candidateOption = candidateContest.candidates[0]
  const yesnoContest = electionSample.contests.find(
    ({ type }) => type === 'yesno'
  ) as YesNoContest
  const yesnoOption = 'yes'

  expect(
    applyChangesToMarks([
      {
        type: 'candidate',
        contest: candidateContest,
        option: candidateOption,
        bounds: zeroRect,
        score: 1,
        target: {
          bounds: zeroRect,
          inner: zeroRect,
        },
      },
      {
        type: 'yesno',
        contest: yesnoContest,
        option: yesnoOption,
        bounds: zeroRect,
        score: 1,
        target: {
          bounds: zeroRect,
          inner: zeroRect,
        },
      },
    ])
  ).toEqual({})
})

test('returns an empty object when a change without values is given', () => {
  const candidateContest = electionSample.contests.find(
    ({ type }) => type === 'candidate'
  ) as CandidateContest
  const candidateOption = candidateContest.candidates[0]
  const yesnoContest = electionSample.contests.find(
    ({ type }) => type === 'yesno'
  ) as YesNoContest
  const yesnoOption = 'yes'

  expect(
    applyChangesToMarks(
      [
        {
          type: 'candidate',
          contest: candidateContest,
          option: candidateOption,
          bounds: zeroRect,
          score: 1,
          target: {
            bounds: zeroRect,
            inner: zeroRect,
          },
        },
        {
          type: 'yesno',
          contest: yesnoContest,
          option: yesnoOption,
          bounds: zeroRect,
          score: 1,
          target: {
            bounds: zeroRect,
            inner: zeroRect,
          },
        },
      ],
      {}
    )
  ).toEqual({})
})

test('returns the subset of the changes that differ from the original marks', () => {
  const contest = electionSample.contests.find(
    ({ type }) => type === 'candidate'
  ) as CandidateContest
  const option1 = contest.candidates[0]
  const option2 = contest.candidates[1]

  expect(
    applyChangesToMarks(
      [
        {
          type: 'candidate',
          contest,
          option: option1,
          bounds: zeroRect,
          score: 1,
          target: {
            bounds: zeroRect,
            inner: zeroRect,
          },
        },
        {
          type: 'candidate',
          contest,
          option: option2,
          bounds: zeroRect,
          score: 1,
          target: {
            bounds: zeroRect,
            inner: zeroRect,
          },
        },
      ],

      {
        [contest.id]: { [option1.id]: false, [option2.id]: true },
      }
    )
  ).toEqual({
    [contest.id]: { [option1.id]: false },
  })
})

test('takes the last value for a given option', () => {
  const contest = electionSample.contests.find(
    ({ type }) => type === 'candidate'
  ) as CandidateContest
  const option = contest.candidates[0]

  expect(
    applyChangesToMarks(
      [
        {
          type: 'candidate',
          contest,
          option,
          bounds: zeroRect,
          score: 1,
          target: {
            bounds: zeroRect,
            inner: zeroRect,
          },
        },
      ],

      { [contest.id]: { [option.id]: false } },
      { [contest.id]: { [option.id]: true } }
    )
  ).toEqual({})
})

test('does not factor stray marks into the result', () => {
  const contest = electionSample.contests.find(
    ({ type }) => type === 'candidate'
  ) as CandidateContest
  const option = contest.candidates[0]

  expect(
    applyChangesToMarks(
      [
        {
          type: 'candidate',
          contest,
          option,
          bounds: zeroRect,
          score: 1,
          target: {
            bounds: zeroRect,
            inner: zeroRect,
          },
        },
        {
          type: 'stray',
          contest,
          option,
          bounds: zeroRect,
        },
      ],
      { [contest.id]: { [option.id]: false } }
    )
  ).toEqual({ [contest.id]: { [option.id]: false } })
})
