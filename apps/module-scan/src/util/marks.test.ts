import { MarkStatus } from '../types/ballot-review'
import { mergeChanges } from './marks'

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
