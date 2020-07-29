import { MarkStatus } from '../types/ballot-review'
import { mergeChanges, changesToCVR } from './marks'

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

test('changesToCVR does a proper merge', () => {
  const metadata = {
    ballotStyleId: '12',
    isTestBallot: false,
    locales: {
      primary: 'en-US',
      secondary: 'es-US',
    },
    pageCount: 5,
    pageNumber: 1,
    precinctId: '23',
  }

  const changes = {
    congressperson: { 'beyonce-knowles': MarkStatus.Marked },
  }

  const originalCVR = {
    _ballotId: '424242',
    _ballotStyleId: '12',
    _precinctId: '23',
    _pageNumber: 1,
    _locales: {
      primary: 'en-US',
      secondary: 'es-US',
    },
    _scannerId: '4242',
    _testBallot: false,
    president: ['amelia-earhart'],
    senator: ['marie-curie'],
    congressperson: [],
  }

  const newCVR = changesToCVR(changes, metadata, originalCVR)

  expect(newCVR).toEqual({
    _ballotId: '424242',
    _ballotStyleId: '12',
    _precinctId: '23',
    _pageNumber: 1,
    _locales: {
      primary: 'en-US',
      secondary: 'es-US',
    },
    _scannerId: '4242',
    _testBallot: false,
    president: ['amelia-earhart'],
    senator: ['marie-curie'],
    congressperson: ['beyonce-knowles'],
  })
})
