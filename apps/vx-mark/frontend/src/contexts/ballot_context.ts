import { createContext } from 'react';
import * as GLOBALS from '../config/globals';

import { BallotContextInterface, MarkOnly } from '../config/types';

const ballot: BallotContextInterface = {
  machineConfig: {
    machineId: '000',
    appMode: MarkOnly,
    codeVersion: 'dev',
    screenOrientation: 'portrait',
  },
  contests: [],
  isCardlessVoter: false,
  isLiveMode: false,
  // eslint-disable-next-line @typescript-eslint/require-await
  markVoterCardVoided: async () => false,
  // eslint-disable-next-line @typescript-eslint/require-await
  markVoterCardPrinted: async () => false,
  resetBallot: () => undefined,
  setUserSettings: () => undefined,
  updateTally: () => undefined,
  updateVote: () => undefined,
  forceSaveVote: () => undefined,
  userSettings: GLOBALS.DEFAULT_USER_SETTINGS,
  votes: {},
};

export const BallotContext = createContext(ballot);
