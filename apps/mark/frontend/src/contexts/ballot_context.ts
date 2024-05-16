import { createContext } from 'react';

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
  generateBallotId: () => '',
  endVoterSession: () => Promise.resolve(),
  resetBallot: () => undefined,
  updateVote: () => undefined,
  votes: {},
};

export const BallotContext = createContext(ballot);
