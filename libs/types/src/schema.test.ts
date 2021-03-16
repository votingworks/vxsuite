import { election as electionSample } from '../test/election'
import { parseElection, AdjudicationReason } from './election'

test('parsing a valid election', () => {
  expect(parseElection(electionSample)).toEqual(electionSample)
})

test('contest IDs cannot start with an underscore', () => {
  expect(() =>
    console.log(
      parseElection({
        ...electionSample,
        contests: [
          {
            ...electionSample.contests[0],
            id: '_president',
          },
        ],
      })
    )
  ).toThrowError()
})

test('allows valid mark thresholds', () => {
  expect(() =>
    parseElection({
      ...electionSample,
      markThresholds: { definite: 0.2, marginal: 0.2 },
    })
  ).not.toThrowError()

  expect(() =>
    parseElection({
      ...electionSample,
      markThresholds: { definite: 0.2, marginal: 0.1 },
    })
  ).not.toThrowError()
})

test('disallows invalid mark thresholds', () => {
  expect(() =>
    parseElection({
      ...electionSample,
      markThresholds: { definite: 0.2, marginal: 0.3 },
    })
  ).toThrowError(
    'marginal mark threshold must be less than or equal to definite mark threshold'
  )

  expect(() =>
    parseElection({
      ...electionSample,
      markThresholds: { marginal: 0.3 },
    })
  ).toThrowError()

  expect(() =>
    parseElection({
      ...electionSample,
      markThresholds: { definite: 1.2, marginal: 0.3 },
    })
  ).toThrowError('Value should be less than or equal to 1')
})

test('allows valid adjudication reasons', () => {
  expect(() =>
    parseElection({
      ...electionSample,
      adjudicationReasons: [],
    })
  ).not.toThrowError()

  expect(() =>
    parseElection({
      ...electionSample,
      adjudicationReasons: [
        AdjudicationReason.MarginalMark,
        AdjudicationReason.UninterpretableBallot,
      ],
    })
  ).not.toThrowError()
})

test('disallows invalid adjudication reasons', () => {
  expect(() =>
    parseElection({
      ...electionSample,
      adjudicationReasons: ['abcdefg'],
    })
  ).toThrowError()

  expect(() =>
    parseElection({
      ...electionSample,
      adjudicationReasons: 'foooo',
    })
  ).toThrowError()
})

test('supports ballot layout paper size', () => {
  expect(() =>
    parseElection({
      ...electionSample,
      ballotLayout: {
        paperSize: 'A4',
      },
    })
  ).toThrowError()

  expect(() =>
    parseElection({
      ...electionSample,
      ballotLayout: 'letter',
    })
  ).toThrowError()
})
