import { createContext } from 'react'
import { BallotContextInterface } from '../config/types'

const ballot: BallotContextInterface = {
  contests: [],
  resetVotes: () => undefined,
  updateVote: (contestId, vote) => undefined,
  votes: {},
}

const BallotContext = createContext(ballot)

export default BallotContext
