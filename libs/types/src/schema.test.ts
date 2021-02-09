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
  ).toThrowError('IDs may not start with an underscore')
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
  ).toThrowError('definite: Non-number type: undefined')

  expect(() =>
    parseElection({
      ...electionSample,
      markThresholds: { definite: 1.2, marginal: 0.3 },
    })
  ).toThrowError('definite: Value must be <= 1')
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
  ).toThrowError('"abcdefg" does not match any value in enum')

  expect(() =>
    parseElection({
      ...electionSample,
      adjudicationReasons: 'foooo',
    })
  ).toThrowError('Non-array type: string')
})
