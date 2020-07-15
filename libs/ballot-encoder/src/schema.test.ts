import { parseElection, electionSample } from './election'

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
