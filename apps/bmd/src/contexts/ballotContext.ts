import { createContext } from 'react'
import { BallotContextInterface, Election } from '../config/types'

const ballot: BallotContextInterface = {
  election: undefined,
  resetBallot: () => undefined,
  setBallotKey: activationCode => undefined,
  updateVote: (contestId, vote) => undefined,
  votes: {},
}

const BallotContext = createContext(ballot)

export default BallotContext
