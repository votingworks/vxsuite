import { createContext } from 'react'
import * as GLOBALS from '../config/globals'

import { BallotContextInterface, TextSizeSetting } from '../config/types'
import { NullPrinter } from '../utils/printer'

const ballot: BallotContextInterface = {
  activateBallot: () => undefined,
  ballotStyleId: '',
  contests: [],
  election: undefined,
  incrementBallotsPrintedCount: () => undefined,
  isLiveMode: false,
  markVoterCardUsed: async () => false,
  precinctId: '',
  printer: new NullPrinter(),
  resetBallot: () => undefined,
  setUserSettings: () => undefined,
  updateVote: () => undefined,
  userSettings: { textSize: GLOBALS.TEXT_SIZE as TextSizeSetting },
  votes: {},
}

const BallotContext = createContext(ballot)

export default BallotContext
