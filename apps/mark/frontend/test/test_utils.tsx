import { createMemoryHistory, History } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import { render as testRender, screen } from '@testing-library/react';
import {
  BallotStyleId,
  Contests,
  ElectionDefinition,
  PrecinctId,
  VotesDict,
  MarkOnly,
} from '@votingworks/types';
import { MachineConfig } from '@votingworks/mark-backend';

import userEvent from '@testing-library/user-event';
import { CARD_POLLING_INTERVAL } from '@votingworks/ui';
import { electionSampleNoSealDefinition } from '@votingworks/fixtures';
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
    isCardlessVoter = false,
    isLiveMode = false,
    machineConfig = fakeMachineConfig({ appMode: MarkOnly }),
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

export async function enterPin(): Promise<void> {
  jest.advanceTimersByTime(CARD_POLLING_INTERVAL);
  await screen.findByText('Enter the card security code to unlock.');
  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));
}
