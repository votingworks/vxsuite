import { MarkStatus } from '../types/ballot-review'
import { BallotMark } from '@votingworks/hmpb-interpreter'
import { mergeChanges, changesFromMarks } from './marks'

test('returns an empty object when no changes are given', () => {
  expect(mergeChanges({ contest: { option: MarkStatus.Marked } })).toEqual({})
})

test('returns an empty object when a change without values is given', () => {
  expect(mergeChanges({ contest: { option: MarkStatus.Marked } }, {})).toEqual(
    {}
  )
})

test('returns the subset of the changes that differ from the original marks', () => {
  expect(
    mergeChanges(
      {
        contest: {
          option1: MarkStatus.Marginal,
          option2: MarkStatus.Marked,
        },
      },
      {
        contest: {
          option1: MarkStatus.Unmarked,
          option2: MarkStatus.Marked,
        },
      }
    )
  ).toEqual({
    contest: { option1: MarkStatus.Unmarked },
  })
})

test('takes the last value for a given option', () => {
  expect(
    mergeChanges(
      {},
      { contest: { option: MarkStatus.Unmarked } },
      { contest: { option: MarkStatus.Marked } }
    )
  ).toEqual({ contest: { option: MarkStatus.Marked } })
})

test('merges options from the same contest', () => {
  expect(
    mergeChanges(
      {},
      { contest: { option1: MarkStatus.Unmarked } },
      { contest: { option2: MarkStatus.Marked } }
    )
  ).toEqual({
    contest: { option1: MarkStatus.Unmarked, option2: MarkStatus.Marked },
  })
})

test('merges multiple contests', () => {
  expect(
    mergeChanges(
      {},
      { contest1: { option: MarkStatus.Unmarked } },
      { contest2: { option: MarkStatus.Marked } }
    )
  ).toEqual({
    contest1: { option: MarkStatus.Unmarked },
    contest2: { option: MarkStatus.Marked },
  })
})

test('removes contests that revert back to the original', () => {
  expect(
    mergeChanges(
      { contest: { option: MarkStatus.Unmarked } },
      { contest: { option: MarkStatus.Marked } },
      { contest: { option: MarkStatus.Unmarked } }
    )
  ).toEqual({})
})

test('changesFromMarks works with ms-either-neither', () => {
  const marks = [
    {
      type: 'ms-either-neither',
      bounds: { x: 50, y: 50, width: 50, height: 50 },
      contest: {
        id: 'either-neither-1',
        section: 'State',
        districtId: '1',
        type: 'ms-either-neither',
        title: 'Ballot Measure 1',
        eitherNeitherContestId: 'either-neither-id',
        pickOneContestId: 'pick-one-id',
        description: 'Blah blah',
        eitherNeitherLabel: 'VOTE FOR APPROVAL OF EITHER, OR AGAINST BOTH',
        pickOneLabel: 'AND VOTE FOR ONE',
        eitherOption: {
          id: 'either-id',
          label:
            'FOR APPROVAL OF EITHER Initiative No. 65 OR Alternative Measure No. 65 A',
        },
        neitherOption: {
          id: 'neither-id',
          label:
            'AGAINST BOTH Initiative Measure No. 65 AND Alternative Measure No. 65 A',
        },
        firstOption: {
          id: 'first-id',
          label: 'FOR Initiative Measure No. 65',
        },
        secondOption: {
          id: 'second-id',
          label: 'FOR Alternative Measure 65 A',
        },
      },
      target: {
        bounds: { x: 50, y: 50, width: 50, height: 50 },
        inner: { x: 50, y: 50, width: 50, height: 50 },
      },
      option: {
        id: 'either-id',
        label:
          'FOR APPROVAL OF EITHER Initiative No. 65 OR Alternative Measure No. 65 A',
      },
      score: 0.9,
    } as BallotMark,
  ]

  expect(changesFromMarks(marks, { marginal: 0.12, definite: 0.2 })).toEqual({
    'either-neither-1': {
      'either-id': 'marked',
    },
  })
})
