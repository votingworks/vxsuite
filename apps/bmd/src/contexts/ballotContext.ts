import { createContext } from 'react'
import { BallotContextInterface } from '../config/types'

const ballot: BallotContextInterface = {
  election: undefined,
  resetBallot: () => undefined,
  setBallotKey: () => undefined,
  updateVote: () => undefined,
  votes: {},
}

const BallotContext = createContext(ballot)

export default BallotContext
