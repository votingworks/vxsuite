import { createContext } from 'react';

import type { BallotContextInterface } from '../config/types.js';

const ballot: BallotContextInterface = {
  machineConfig: {
    machineId: '000',
    codeVersion: 'dev',
    screenOrientation: 'portrait',
  },
  contests: [],
  isCardlessVoter: false,
  isLiveMode: false,
  hasPrintedBallot: false,
  setHasPrintedBallot: () => undefined,
  printJobId: undefined,
  setPrintJobId: () => undefined,
  endVoterSession: () => Promise.resolve(),
  resetBallot: () => undefined,
  selectParty: () => undefined,
  updateVote: () => undefined,
  votes: {},
};

export const BallotContext = createContext(ballot);
