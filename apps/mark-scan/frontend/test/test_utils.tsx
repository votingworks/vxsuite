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
import { MachineConfig } from '@votingworks/mark-scan-backend';

import { randomBallotId } from '@votingworks/utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { render as testRender } from './react_testing_library';

import { BallotContext } from '../src/contexts/ballot_context';
import { mockMachineConfig } from './helpers/mock_machine_config';
import { ApiMock, createApiMock } from './helpers/mock_api_client';
import { ApiProvider } from '../src/api_provider';

export function render(
  component: React.ReactNode,
  {
    route = '/',
    ballotStyleId,
    electionDefinition = electionGeneralDefinition,
    contests = electionDefinition.election.contests,
    endVoterSession = jest.fn(),
    history = createMemoryHistory({ initialEntries: [route] }),
    generateBallotId = randomBallotId,
    isCardlessVoter = false,
    isLiveMode = false,
    machineConfig = mockMachineConfig(),
    precinctId,
    resetBallot = jest.fn(),
    updateVote = jest.fn(),
    votes = {},
    apiMock = createApiMock(),
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
    votes?: VotesDict;
    apiMock?: ApiMock;
  } = {}
): ReturnType<typeof testRender> {
  return {
    ...testRender(
      <ApiProvider apiClient={apiMock.mockApiClient}>
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
            updateVote,
            votes,
          }}
        >
          <Router history={history}>{component}</Router>
        </BallotContext.Provider>
      </ApiProvider>
    ),
  };
}
