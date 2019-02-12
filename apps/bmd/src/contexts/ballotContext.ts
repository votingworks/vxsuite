import { createContext } from 'react'
import { BallotContextInterface } from '../config/types'

const ballot: BallotContextInterface = {
  contests: [],
  resetBallot: () => undefined,
  updateVote: (contestId, vote) => undefined,
  votes: {},
}

const BallotContext = createContext(ballot)

export default BallotContext
