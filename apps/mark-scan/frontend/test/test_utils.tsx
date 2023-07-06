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

import { electionSampleNoSealDefinition } from '@votingworks/fixtures';
import { randomBallotId } from '@votingworks/utils';
import { QueryClientProvider } from '@tanstack/react-query';
import { ApiClientContext, createQueryClient } from '../src/api';
import { render as testRender } from './react_testing_library';

import { BallotContext } from '../src/contexts/ballot_context';
import { fakeMachineConfig } from './helpers/fake_machine_config';
import { ApiMock, createApiMock } from './helpers/mock_api_client';

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
    updateTally = jest.fn(),
    updateVote = jest.fn(),
    forceSaveVote = jest.fn(),
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
    forceSaveVote?(): void;
    votes?: VotesDict;
    apiMock?: ApiMock;
  } = {}
): ReturnType<typeof testRender> {
  return {
    ...testRender(
      <ApiClientContext.Provider value={apiMock.mockApiClient}>
        <QueryClientProvider client={createQueryClient()}>
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
              updateTally,
              updateVote,
              forceSaveVote,
              votes,
            }}
          >
            <Router history={history}>{component}</Router>
          </BallotContext.Provider>
        </QueryClientProvider>
      </ApiClientContext.Provider>
    ),
  };
}
