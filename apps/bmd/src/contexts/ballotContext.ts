import { createContext } from 'react'
import * as GLOBALS from '../config/globals'

import { NullPrinter } from '../utils/printer'
import {
  BallotContextInterface,
  TextSizeSetting,
  VxMarkOnly,
} from '../config/types'

const ballot: BallotContextInterface = {
  machineConfig: { machineId: '000', appMode: VxMarkOnly, codeVersion: 'dev' },
  contests: [],
  isCardlessVoter: false,
  isLiveMode: false,
  markVoterCardVoided: async () => false,
  markVoterCardPrinted: async () => false,
  printer: new NullPrinter(),
  resetBallot: () => undefined,
  setUserSettings: () => undefined,
  updateTally: () => undefined,
  updateVote: () => undefined,
  forceSaveVote: () => undefined,
  userSettings: { textSize: GLOBALS.TEXT_SIZE as TextSizeSetting },
  votes: {},
}

const BallotContext = createContext(ballot)

export default BallotContext
