import { createContext } from 'react';
import * as GLOBALS from '../config/globals';

import { BallotContextInterface } from '../config/types';

const ballot: BallotContextInterface = {
  machineConfig: {
    machineId: '000',
    codeVersion: 'dev',
    screenOrientation: 'portrait',
  },
  contests: [],
  isCardlessVoter: false,
  isLiveMode: false,
  endVoterSession: () => Promise.resolve(),
  resetBallot: () => undefined,
  setUserSettings: () => undefined,
  updateTally: () => undefined,
  updateVote: () => undefined,
  forceSaveVote: () => undefined,
  userSettings: GLOBALS.DEFAULT_USER_SETTINGS,
  votes: {},
};

export const BallotContext = createContext(ballot);
