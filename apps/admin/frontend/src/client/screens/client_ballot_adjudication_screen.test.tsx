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
import { err, ok } from '@votingworks/basics';
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

// Mock BallotAdjudicationScreen to capture and expose all callbacks.
let capturedProps: Record<string, unknown> = {};
vi.mock('../../screens/ballot_adjudication_screen', () => ({
  BallotAdjudicationScreen({
    cvrId,
    onAcceptDone,
    onSkip,
    onExit,
    ...rest
  }: Record<string, unknown>) {
    capturedProps = { cvrId, onAcceptDone, onSkip, onExit, ...rest };
    return (
      <div data-testid="mock-ballot-adjudication-screen">
        Adjudicating {cvrId as string}
        <button type="button" onClick={onAcceptDone as () => void}>
          Accept
        </button>
        <button type="button" onClick={onSkip as () => void}>
          Skip
        </button>
        <button type="button" onClick={onExit as () => void}>
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
  expectAdjudicationEnabled();
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

function expectAdjudicationEnabled(): void {
  apiMock.apiClient.getAdjudicationSessionStatus
    .expectRepeatedCallsWith()
    .resolves({ isClientAdjudicationEnabled: true });
}

function expectDataLoaderQueries(cvrId: string): void {
  apiMock.apiClient.getBallotAdjudicationData
    .expectRepeatedCallsWith({ cvrId })
    .resolves(
      ok({
        cvrId,
        tag: { cvrId, isResolved: false, isBlankBallot: false },
        contests: [],
      })
    );
  apiMock.apiClient.getBallotImages.expectRepeatedCallsWith({ cvrId }).resolves(
    ok({
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
    })
  );
  apiMock.apiClient.getWriteInCandidates
    .expectRepeatedCallsWith({ contestId: undefined })
    .resolves(ok([]));
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

  apiMock.apiClient.claimBallot.expectCallWith({}).resolves(ok(undefined));
  screen.getByText('Accept').click();
  await screen.findByText('No more ballots available for adjudication.');

  screen.getByRole('button', { name: 'Exit' }).click();
});

test('shows error screen when claim fails during accept', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.claimBallot
    .expectCallWith({})
    .resolves(err({ type: 'host-disconnect' }));
  screen.getByText('Accept').click();
  await screen.findByText('Disconnected from host.');
  screen.getByText('Exit');
});

test('skip releases ballot and claims next with exclusion', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.releaseBallot
    .expectCallWith({ cvrId: 'cvr-1' })
    .resolves(ok());
  apiMock.apiClient.claimBallot
    .expectCallWith({ excludeCvrIds: ['cvr-1'] })
    .resolves(ok('cvr-2'));
  expectDataLoaderQueries('cvr-2');

  screen.getByText('Skip').click();
  await screen.findByText('Adjudicating cvr-2');
});

test('skip clears exclusion set when no more ballots and retries', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.releaseBallot
    .expectCallWith({ cvrId: 'cvr-1' })
    .resolves(ok());
  apiMock.apiClient.claimBallot
    .expectCallWith({ excludeCvrIds: ['cvr-1'] })
    .resolves(ok(undefined));
  apiMock.apiClient.claimBallot.expectCallWith({}).resolves(ok('cvr-1'));
  expectDataLoaderQueries('cvr-1');

  screen.getByText('Skip').click();
  await screen.findByText('Adjudicating cvr-1');
});

test('exit releases ballot', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.releaseBallot
    .expectCallWith({ cvrId: 'cvr-1' })
    .resolves(ok());

  screen.getByText('Exit').click();

  await waitFor(() => {
    expect(apiMock.apiClient.releaseBallot).toBeDefined();
  });
});

test('shows no-claim error with exit button', async () => {
  expectDataLoaderQueries('cvr-1');

  // Override adjudication data to return an error
  apiMock.apiClient.getBallotAdjudicationData.reset();
  apiMock.apiClient.getBallotAdjudicationData
    .expectRepeatedCallsWith({ cvrId: 'cvr-1' })
    .resolves(err({ type: 'no-claim' }));

  renderScreen('cvr-1');

  await screen.findByText(
    'This machine no longer has an active claim on this ballot. Please try again.'
  );
  screen.getByText('Exit');
});

test('shows host-disconnect error with exit button', async () => {
  expectDataLoaderQueries('cvr-1');

  // Override adjudication data to return an error
  apiMock.apiClient.getBallotAdjudicationData.reset();
  apiMock.apiClient.getBallotAdjudicationData
    .expectRepeatedCallsWith({ cvrId: 'cvr-1' })
    .resolves(err({ type: 'host-disconnect' }));

  renderScreen('cvr-1');

  await screen.findByText('Disconnected from host.');
  screen.getByText('Exit');
});

test('redirects when host disables adjudication', async () => {
  // Set up data loader queries (they fire before the redirect)
  expectDataLoaderQueries('cvr-1');

  // Override adjudication status to disabled
  apiMock.apiClient.getAdjudicationSessionStatus.reset();
  apiMock.apiClient.getAdjudicationSessionStatus
    .expectRepeatedCallsWith()
    .resolves({ isClientAdjudicationEnabled: false });

  const clientApiClient = apiMock.apiClient as unknown as ClientApiClient;
  render(
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
                  initialEntries={[`${routerPaths.ballotAdjudication}/cvr-1`]}
                >
                  <Route path={`${routerPaths.ballotAdjudication}/:cvrId`}>
                    <ClientBallotAdjudicationScreen />
                  </Route>
                  <Route path={routerPaths.adjudication}>
                    <div>adjudication start</div>
                  </Route>
                </MemoryRouter>
              </AppContext.Provider>
            </QueryClientProvider>
          </ClientApiClientContext.Provider>
        </SystemCallContextProvider>
      </SharedApiClientContext.Provider>
    </TestErrorBoundary>
  );

  await screen.findByText('adjudication start');
});

test('onSetCvrResolved calls API and accept advances', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  // Call the captured onSetCvrResolved callback
  apiMock.apiClient.setCvrResolved
    .expectCallWith({ cvrId: 'cvr-1' })
    .resolves(ok());
  const onSetCvrResolved = capturedProps[
    'onSetCvrResolved'
  ] as () => Promise<void>;
  await onSetCvrResolved();

  // Then accept advances to next (no more ballots)
  apiMock.apiClient.claimBallot.expectCallWith({}).resolves(ok(undefined));
  screen.getByText('Accept').click();
  await screen.findByText('No more ballots available for adjudication.');
});

test('onSetCvrResolved error shows error screen', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.setCvrResolved
    .expectCallWith({ cvrId: 'cvr-1' })
    .resolves(err({ type: 'no-claim' }));
  const onSetCvrResolved = capturedProps[
    'onSetCvrResolved'
  ] as () => Promise<void>;
  await expect(onSetCvrResolved()).rejects.toThrow();

  await screen.findByText(
    'This machine no longer has an active claim on this ballot. Please try again.'
  );
});

test('onAdjudicateCvrContest calls API', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  const mockInput = {
    cvrId: 'cvr-1',
    contestId: 'c-1',
    side: 'front',
    adjudicatedContestOptionById: {},
  } as const;
  apiMock.apiClient.adjudicateCvrContest
    .expectCallWith(mockInput)
    .resolves(ok());
  const onAdjudicateCvrContest = capturedProps['onAdjudicateCvrContest'] as (
    input: unknown
  ) => Promise<void>;
  await onAdjudicateCvrContest(mockInput);
});

test('onAdjudicateCvrContest error shows error screen', async () => {
  expectDataLoaderQueries('cvr-1');
  renderScreen('cvr-1');
  await screen.findByText('Adjudicating cvr-1');

  const mockInput = {
    cvrId: 'cvr-1',
    contestId: 'c-1',
    side: 'front',
    adjudicatedContestOptionById: {},
  } as const;
  apiMock.apiClient.adjudicateCvrContest
    .expectCallWith(mockInput)
    .resolves(err({ type: 'host-disconnect' }));
  const onAdjudicateCvrContest = capturedProps['onAdjudicateCvrContest'] as (
    input: unknown
  ) => Promise<void>;
  await expect(onAdjudicateCvrContest(mockInput)).rejects.toThrow();

  await screen.findByText('Disconnected from host.');
});
