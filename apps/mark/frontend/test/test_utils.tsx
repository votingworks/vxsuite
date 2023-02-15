import { createMemoryHistory, History } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import {
  BallotStyleId,
  Contests,
  ElectionDefinition,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import { MachineConfig } from '@votingworks/mark-backend';

import { electionSampleNoSealDefinition } from '@votingworks/fixtures';
import { randomBallotId } from '@votingworks/utils';
import { render as testRender } from './react_testing_library';
import * as GLOBALS from '../src/config/globals';

import { UserSettings } from '../src/config/types';

import { BallotContext } from '../src/contexts/ballot_context';
import { fakeMachineConfig } from './helpers/fake_machine_config';

export function render(
  component: React.ReactNode,
  {
    route = '/',
    ballotStyleId,
    electionDefinition = electionSampleNoSealDefinition,
    contests = electionDefinition.election.contests,
    endVoterSession = jest.fn(),
    history = createMemoryHistory({ initialEntries: [route] }),
    generateBallotId = randomBallotId,
    isCardlessVoter = false,
    isLiveMode = false,
    machineConfig = fakeMachineConfig(),
    precinctId,
    resetBallot = jest.fn(),
    setUserSettings = jest.fn(),
    updateTally = jest.fn(),
    updateVote = jest.fn(),
    forceSaveVote = jest.fn(),
    userSettings = GLOBALS.DEFAULT_USER_SETTINGS,
    votes = {},
  }: {
    route?: string;
    ballotStyleId?: BallotStyleId;
    electionDefinition?: ElectionDefinition;
    contests?: Contests;
    endVoterSession?: () => Promise<void>;
    history?: History;
    generateBallotId?: () => string;
    isCardlessVoter?: boolean;
    isLiveMode?: boolean;
    machineConfig?: MachineConfig;
    precinctId?: PrecinctId;
    resetBallot?(): void;
    setUserSettings?(): void;
    updateTally?(): void;
    updateVote?(): void;
    forceSaveVote?(): void;
    userSettings?: UserSettings;
    votes?: VotesDict;
  } = {}
): ReturnType<typeof testRender> {
  return {
    ...testRender(
      <BallotContext.Provider
        value={{
          ballotStyleId,
          contests,
          electionDefinition,
          generateBallotId,
          isCardlessVoter,
          isLiveMode,
          machineConfig,
          endVoterSession,
          precinctId,
          resetBallot,
          setUserSettings,
          updateTally,
          updateVote,
          forceSaveVote,
          userSettings,
          votes,
        }}
      >
        <Router history={history}>{component}</Router>
      </BallotContext.Provider>
    ),
  };
}
