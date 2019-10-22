import { createContext } from 'react'
import { Election } from '@votingworks/ballot-encoder'
import * as GLOBALS from '../config/globals'

import { NullPrinter } from '../utils/printer'
import {
  BallotContextInterface,
  TextSizeSetting,
  VxMarkOnly,
} from '../config/types'

const ballot: BallotContextInterface = {
  activateBallot: () => undefined,
  appMode: VxMarkOnly,
  ballotStyleId: '',
  contests: [],
  election: (undefined as unknown) as Election,
  isLiveMode: false,
  markVoterCardVoided: async () => false,
  markVoterCardPrinted: async () => false,
  precinctId: '',
  printer: new NullPrinter(),
  resetBallot: () => undefined,
  setUserSettings: () => undefined,
  updateTally: () => undefined,
  updateVote: () => undefined,
  userSettings: { textSize: GLOBALS.TEXT_SIZE as TextSizeSetting },
  votes: {},
}

const BallotContext = createContext(ballot)

export default BallotContext
