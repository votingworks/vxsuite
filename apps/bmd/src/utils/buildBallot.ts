import {
  BallotType,
  CompletedBallot,
  Election,
  getBallotStyle,
  getPrecinctById,
  VotesDict,
} from '@votingworks/ballot-encoder'
import assertDefined from './assertDefined'
import { randomBase64 } from './random'

/**
 * Builds a ballot from the app state.
 */
export default function buildBallot({
  ballotStyleId,
  election,
  isTestBallot,
  precinctId,
  votes,
}: {
  ballotStyleId: string
  election: Election
  isTestBallot: boolean
  precinctId: string
  votes: VotesDict
}): CompletedBallot {
  const ballotId = randomBase64()
  const ballotStyle = getBallotStyle({ ballotStyleId, election })
  const ballotType = BallotType.Standard
  const precinct = getPrecinctById({ precinctId, election })

  assertDefined(ballotStyle)
  assertDefined(precinct)

  return {
    ballotId,
    ballotStyle,
    ballotType,
    election,
    isTestBallot,
    precinct,
    votes,
  }
}
