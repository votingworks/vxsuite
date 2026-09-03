import { vi } from 'vitest';
import { createMemoryHistory, History } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import {
  BallotStyleId,
  Contest,
  ElectionDefinition,
  PartyId,
  DEFAULT_SYSTEM_SETTINGS,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import { MachineConfig } from '@votingworks/mark-scan-backend';

import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { render as testRender } from './react_testing_library.js';

import { BallotContext } from '../src/contexts/ballot_context.js';
import { mockMachineConfig } from './helpers/mock_machine_config.js';
import { ApiMock, createApiMock } from './helpers/mock_api_client.js';
import { ApiProvider } from '../src/api_provider.js';

export function render(
  component: React.ReactNode,
  {
    route = '/',
    ballotStyleId,
    electionDefinition = readElectionGeneralDefinition(),
    contests = electionDefinition.election.contests,
    endVoterSession = vi.fn(),
    history = createMemoryHistory({ initialEntries: [route] }),
    isCardlessVoter = false,
    isLiveMode = false,
    machineConfig = mockMachineConfig(),
    precinctId,
    resetBallot = vi.fn(),
    selectParty = vi.fn(),
    selectedPartyId,
    updateVote = vi.fn(),
    votes = {},
    apiMock = createApiMock(),
  }: {
    route?: string;
    ballotStyleId?: BallotStyleId;
    electionDefinition?: ElectionDefinition;
    contests?: readonly Contest[];
    endVoterSession?: () => Promise<void>;
    history?: History;
    isCardlessVoter?: boolean;
    isLiveMode?: boolean;
    machineConfig?: MachineConfig;
    precinctId?: PrecinctId;
    resetBallot?(): void;
    selectedPartyId?: PartyId;
    selectParty?(partyId: PartyId): void;
    setUserSettings?(): void;
    updateTally?(): void;
    updateVote?(): void;
    votes?: VotesDict;
    apiMock?: ApiMock;
  } = {}
): ReturnType<typeof testRender> {
  apiMock.mockApiClient.getSystemSettings
    .expectOptionalRepeatedCallsWith()
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.mockApiClient.getUsbPortStatus
    .expectOptionalRepeatedCallsWith()
    .resolves({ enabled: true });

  return {
    ...testRender(
      <ApiProvider apiClient={apiMock.mockApiClient}>
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
            selectParty,
            selectedPartyId,
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
