import { vi } from 'vitest';
import { createMemoryHistory, type History } from 'history';
import type React from 'react';
import { Router } from 'react-router-dom';
import {
  type BallotStyleId,
  type Contest,
  DEFAULT_SYSTEM_SETTINGS,
  type ElectionDefinition,
  type PartyId,
  type PrecinctId,
  type PrintJobId,
  type VotesDict,
} from '@votingworks/types';
import type { MachineConfig } from '@votingworks/mark-backend';

import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { render as testRender } from './react_testing_library.js';
import { BallotContext } from '../src/contexts/ballot_context.js';
import { mockMachineConfig } from './helpers/mock_machine_config.js';
import { type ApiMock, createApiMock } from './helpers/mock_api_client.js';
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
    hasPrintedBallot = false,
    printJobId,
    precinctId,
    resetBallot = vi.fn(),
    selectedPartyId,
    selectParty = vi.fn(),
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
    hasPrintedBallot?: boolean;
    printJobId?: PrintJobId;
    precinctId?: PrecinctId;
    resetBallot?(): void;
    selectedPartyId?: PartyId;
    selectParty?(partyId: PartyId): void;
    setUserSettings?(): void;
    updateVote?(): void;
    votes?: VotesDict;
    apiMock?: ApiMock;
  } = {}
): ReturnType<typeof testRender> {
  apiMock.mockApiClient.getSystemSettings
    .expectOptionalRepeatedCallsWith()
    .resolves(DEFAULT_SYSTEM_SETTINGS);

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
            hasPrintedBallot,
            setHasPrintedBallot: () => undefined,
            printJobId,
            setPrintJobId: () => undefined,
            precinctId,
            resetBallot,
            selectedPartyId,
            selectParty,
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
