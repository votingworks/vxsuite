import { createContext } from 'react';
import { NullPrinter } from '@votingworks/utils';
import * as GLOBALS from '../config/globals';

import {
  BallotContextInterface,
  TextSizeSetting,
  MarkOnly,
} from '../config/types';

const ballot: BallotContextInterface = {
  machineConfig: { machineId: '000', appMode: MarkOnly, codeVersion: 'dev' },
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
};

export const BallotContext = createContext(ballot);
