import { electionSample, BallotType } from '@votingworks/ballot-encoder'
import buildBallot from './buildBallot'

test('builds a ballot given the data held in application state', () => {
  expect(
    buildBallot({
      ballotStyleId: electionSample.ballotStyles[0].id,
      precinctId: electionSample.precincts[0].id,
      election: electionSample,
      isTestBallot: true,
      votes: {},
    })
  ).toMatchObject({
    ballotId: expect.any(String),
    ballotStyle: electionSample.ballotStyles[0],
    ballotType: BallotType.Standard,
    election: electionSample,
    isTestBallot: true,
    precinct: electionSample.precincts[0],
    votes: {},
  })
})
