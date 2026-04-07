import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import {
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth,
} from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { MemoryRouter, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  mockUsbDriveStatus,
  SystemCallContextProvider,
  TestErrorBoundary,
} from '@votingworks/ui';
import { render, screen, waitFor } from '../../../test/react_testing_library';
import {
  ClientApiMock,
  createClientApiMock,
} from '../../../test/helpers/mock_client_api_client';
import { ClientBallotAdjudicationScreen } from './client_ballot_adjudication_screen';
import {
  ApiClient as ClientApiClient,
  ApiClientContext as ClientApiClientContext,
  createQueryClient,
} from '../api';
import { SharedApiClientContext, systemCallApi } from '../../shared_api';
import { AppContext } from '../../contexts/app_context';
import { routerPaths } from '../../router_paths';

// Mock BallotAdjudicationScreen to avoid needing full adjudication API mocking.
let capturedProps: Record<string, unknown> = {};
vi.mock('../../screens/ballot_adjudication_screen', () => ({
  BallotAdjudicationScreen({
    cvrId,
    onAcceptDone,
    onSkip,
    onExit,
  }: {
    cvrId: string;
    onAcceptDone: () => void;
    onSkip: () => void;
    onExit: () => void;
  }) {
    capturedProps = { cvrId, onAcceptDone, onSkip, onExit };
    return (
      <div data-testid="mock-ballot-adjudication-screen">
        Adjudicating {cvrId}
        <button type="button" onClick={onAcceptDone}>
          Accept
        </button>
        <button type="button" onClick={onSkip}>
          Skip
        </button>
        <button type="button" onClick={onExit}>
          Exit
        </button>
      </div>
    );
  },
}));

let apiMock: ClientApiMock;

const electionDefinition = readElectionGeneralDefinition();

beforeEach(() => {
  capturedProps = {};
  apiMock = createClientApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const pollWorkerAuth: DippedSmartCardAuth.PollWorkerLoggedIn = {
  status: 'logged_in',
  user: mockPollWorkerUser({
    electionKey: constructElectionKey(electionDefinition.election),
  }),
  sessionExpiresAt: mockSessionExpiresAt(),
};

function renderScreen(cvrId = 'cvr-1') {
  const clientApiClient = apiMock.apiClient as unknown as ClientApiClient;
  return render(
    <TestErrorBoundary>
      <SharedApiClientContext.Provider value={clientApiClient}>
        <SystemCallContextProvider api={systemCallApi}>
          <ClientApiClientContext.Provider value={clientApiClient}>
            <QueryClientProvider client={createQueryClient()}>
              <AppContext.Provider
                value={{
                  auth: pollWorkerAuth,
                  machineConfig: { machineId: '0000', codeVersion: 'dev' },
                  isOfficialResults: false,
                  usbDriveStatus: mockUsbDriveStatus('no_drive'),
                  machineMode: 'client',
                  electionDefinition,
                  electionPackageHash: 'test-hash',
                }}
              >
                <MemoryRouter
                  initialEntries={[
                    `${routerPaths.ballotAdjudication}/${cvrId}`,
                  ]}
                >
                  <Route path={`${routerPaths.ballotAdjudication}/:cvrId`}>
                    <ClientBallotAdjudicationScreen />
                  </Route>
                </MemoryRouter>
              </AppContext.Provider>
            </QueryClientProvider>
          </ClientApiClientContext.Provider>
        </SystemCallContextProvider>
      </SharedApiClientContext.Provider>
    </TestErrorBoundary>
  );
}

function expectDataLoaderQueries(cvrId: string): void {
  apiMock.apiClient.getBallotAdjudicationData
    .expectRepeatedCallsWith({ cvrId })
    .resolves({ cvrId, contests: [] });
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId })
    .resolves({
      cvrId,
      front: {
        type: 'bmd' as const,
        imageUrl: 'mock-image',
        ballotCoordinates: { x: 0, y: 0, width: 100, height: 100 },
      },
      back: {
        type: 'bmd' as const,
        imageUrl: 'mock-image',
        ballotCoordinates: { x: 0, y: 0, width: 100, height: 100 },
      },
    });
  apiMock.apiClient.getWriteInCandidates
    .expectRepeatedCallsWith({ contestId: undefined })
    .resolves([]);
  apiMock.apiClient.getSystemSettings
    .expectRepeatedCallsWith()
    .resolves(DEFAULT_SYSTEM_SETTINGS);
}

test('renders adjudicating state with initial cvrId from route', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');
  expect(capturedProps['cvrId']).toEqual('cvr-1');
});

test('accept claims next ballot', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.claimBallot.expectCallWith({}).resolves(undefined);
  screen.getByText('Accept').click();
  await screen.findByText('No more ballots available for adjudication.');

  screen.getByRole('button', { name: 'Back to Adjudication' }).click();
});

test('skip releases ballot and claims next with exclusion', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.releaseBallot.expectCallWith({ cvrId: 'cvr-1' }).resolves();
  apiMock.apiClient.claimBallot
    .expectCallWith({ excludeCvrIds: ['cvr-1'] })
    .resolves('cvr-2');
  expectDataLoaderQueries('cvr-2');

  screen.getByText('Skip').click();
  await screen.findByText('Adjudicating cvr-2');
});

test('skip clears exclusion set when no more ballots and retries', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.releaseBallot.expectCallWith({ cvrId: 'cvr-1' }).resolves();
  apiMock.apiClient.claimBallot
    .expectCallWith({ excludeCvrIds: ['cvr-1'] })
    .resolves(undefined);
  apiMock.apiClient.claimBallot.expectCallWith({}).resolves('cvr-1');
  expectDataLoaderQueries('cvr-1');

  screen.getByText('Skip').click();
  await screen.findByText('Adjudicating cvr-1');
});

test('exit releases ballot', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.releaseBallot.expectCallWith({ cvrId: 'cvr-1' }).resolves();

  screen.getByText('Exit').click();

  await waitFor(() => {
    expect(apiMock.apiClient.releaseBallot).toBeDefined();
  });
});
