import GLOBALS from '../config/globals'

import { createContext } from 'react'
import { BallotContextInterface, TextSizeSetting } from '../config/types'

const ballot: BallotContextInterface = {
  election: undefined,
  resetBallot: () => undefined,
  setBallotKey: () => undefined,
  setUserSettings: () => undefined,
  updateVote: () => undefined,
  userSettings: {
    textSize: GLOBALS.TEXT_SIZE as TextSizeSetting,
  },
  votes: {},
}

const BallotContext = createContext(ballot)

export default BallotContext
