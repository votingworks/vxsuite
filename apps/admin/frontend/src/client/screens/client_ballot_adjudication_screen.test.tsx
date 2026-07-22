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
import { Route } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { screen, waitFor, within } from '../../../test/react_testing_library';
import {
  ClientApiMock,
  createClientApiMock,
} from '../../../test/helpers/mock_client_api_client';
import { renderInClientContext } from '../../../test/render_in_client_context';
import { ClientBallotAdjudicationScreen } from './client_ballot_adjudication_screen';
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
          Escalate
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

// Renders the screen at the ballot adjudication route and returns the memory
// history so tests can assert on navigation (e.g. the redirect to the
// adjudication start screen when the host disables adjudication).
function renderScreen({
  adjudicationEnabled = true,
}: { adjudicationEnabled?: boolean } = {}) {
  apiMock.apiClient.getAdjudicationSessionStatus
    .expectRepeatedCallsWith()
    .resolves({ isClientAdjudicationEnabled: adjudicationEnabled });
  const history = createMemoryHistory({
    initialEntries: [routerPaths.ballotAdjudication],
  });
  renderInClientContext(
    <Route exact path={routerPaths.ballotAdjudication}>
      <ClientBallotAdjudicationScreen />
    </Route>,
    {
      history,
      auth: pollWorkerAuth,
      electionDefinition,
      apiMock,
    }
  );
  return { history };
}

function makeBallotData(cvrId: string) {
  return {
    cvrId,
    tag: { isBlankBallot: false, hasCrossoverVote: false } as const,
    isResolved: false,
    isEscalated: false,
    contests: [],
    adjudicatedContests: [],
  };
}

// Per-cvrId mocks the data loader runs once it has the ballot data.
// Global mocks (write-in candidates, system settings) live in
// `expectGlobalDataLoaderQueries` since they're cached across cvrIds.
function expectDataLoaderQueries(cvrId: string): void {
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
}

// One-shot setup for the cvrId-independent queries the data loader fires.
function expectGlobalDataLoaderQueries(): void {
  apiMock.apiClient.getWriteInCandidates
    .expectRepeatedCallsWith({ contestIds: [] })
    .resolves(ok([]));
  apiMock.apiClient.getSystemSettings
    .expectRepeatedCallsWith()
    .resolves(DEFAULT_SYSTEM_SETTINGS);
}

// Sets up the initial-mount claim+load call. The client always claims the
// next available ballot ({}); the host decides which cvrId that is, returned
// here as `cvrId`. Tests that want to override the result (e.g. claim-failure
// flows) skip this and mock directly.
function expectInitialClaimAndLoad(cvrId: string): void {
  apiMock.apiClient.claimAndLoadBallot
    .expectCallWith({})
    .resolves(ok({ cvrId, data: makeBallotData(cvrId) }));
}

test('claims the next available ballot on mount', async () => {
  // Arriving from "Start Adjudication", the screen claims the next available
  // ballot ({}); the host returns which cvrId that is.
  expectDataLoaderQueries('cvr-1');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');
  renderScreen();
  await screen.findByText('Adjudicating cvr-1');
  expect(capturedProps['cvrId']).toEqual('cvr-1');
});

test('accept claims next ballot', async () => {
  expectDataLoaderQueries('cvr-1');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');
  renderScreen();
  await screen.findByText('Adjudicating cvr-1');

  // After accept on cvr-1, the screen asks for the next ballot after it; the
  // backend wraps around and returns nothing when none remain.
  apiMock.apiClient.claimAndLoadBallot
    .expectCallWith({ afterCvrId: 'cvr-1' })
    .resolves(ok(undefined));
  screen.getByText('Accept').click();
  await screen.findByText('No more ballots available for adjudication.');

  screen.getByRole('button', { name: 'Exit' }).click();
});

test('shows error screen when claim fails during accept', async () => {
  expectDataLoaderQueries('cvr-1');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');
  renderScreen();
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.claimAndLoadBallot
    .expectCallWith({ afterCvrId: 'cvr-1' })
    .resolves(err({ type: 'host-disconnect' }));
  screen.getByText('Accept').click();
  await screen.findByText('Disconnected from host.');
  screen.getByText('Exit');
});

test('skip confirms, escalates the ballot, and claims next after it', async () => {
  expectDataLoaderQueries('cvr-1');
  expectDataLoaderQueries('cvr-2');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');
  renderScreen();
  await screen.findByText('Adjudicating cvr-1');

  screen.getByText('Escalate').click();
  await screen.findByText(
    'Are you sure you want to escalate this ballot for election manager review and adjudication?'
  );

  apiMock.apiClient.escalateBallot
    .expectCallWith({ cvrId: 'cvr-1' })
    .resolves(ok());
  apiMock.apiClient.claimAndLoadBallot
    .expectCallWith({ afterCvrId: 'cvr-1' })
    .resolves(ok({ cvrId: 'cvr-2', data: makeBallotData('cvr-2') }));

  within(screen.getByRole('alertdialog')).getByText('Escalate').click();
  await screen.findByText('Adjudicating cvr-2');
});

test('canceling the skip modal keeps adjudicating the same ballot', async () => {
  expectDataLoaderQueries('cvr-1');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');
  renderScreen();
  await screen.findByText('Adjudicating cvr-1');

  screen.getByText('Escalate').click();
  await screen.findByText('Escalate Ballot');

  screen.getByText('Cancel').click();
  await waitFor(() =>
    expect(screen.queryByText('Escalate Ballot')).not.toBeInTheDocument()
  );
  screen.getByText('Adjudicating cvr-1');
});

test('skipping the last eligible ballot finishes the session', async () => {
  expectDataLoaderQueries('cvr-1');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');
  renderScreen();
  await screen.findByText('Adjudicating cvr-1');

  // The escalated ballot is no longer served to clients, so with nothing else
  // eligible the claim comes back empty.
  apiMock.apiClient.escalateBallot
    .expectCallWith({ cvrId: 'cvr-1' })
    .resolves(ok());
  apiMock.apiClient.claimAndLoadBallot
    .expectCallWith({ afterCvrId: 'cvr-1' })
    .resolves(ok(undefined));

  screen.getByText('Escalate').click();
  await screen.findByText('Escalate Ballot');
  within(screen.getByRole('alertdialog')).getByText('Escalate').click();
  await screen.findByText('No more ballots available for adjudication.');
});

test('skip shows an error when escalation fails', async () => {
  expectDataLoaderQueries('cvr-1');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');
  renderScreen();
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.escalateBallot
    .expectCallWith({ cvrId: 'cvr-1' })
    .resolves(err({ type: 'host-disconnect' }));

  screen.getByText('Escalate').click();
  await screen.findByText('Escalate Ballot');
  within(screen.getByRole('alertdialog')).getByText('Escalate').click();
  await screen.findByText('Disconnected from host.');
});

test('exit releases ballot', async () => {
  expectDataLoaderQueries('cvr-1');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');
  renderScreen();
  await screen.findByText('Adjudicating cvr-1');

  apiMock.apiClient.releaseBallot
    .expectCallWith({ cvrId: 'cvr-1' })
    .resolves(ok());

  screen.getByText('Exit').click();

  await waitFor(() => {
    expect(apiMock.apiClient.releaseBallot).toBeDefined();
  });
});

test('shows claim-failed error with exit button', async () => {
  // Initial claim+load fails with claim-failed — auxiliary data loader queries
  // never run because we bail to the error screen first.
  apiMock.apiClient.claimAndLoadBallot
    .expectRepeatedCallsWith({})
    .resolves(err({ type: 'claim-failed' }));

  renderScreen();

  await screen.findByText(
    'This machine no longer has an active claim on this ballot. Please try again.'
  );
  screen.getByText('Exit');
});

test('shows host-disconnect error with exit button', async () => {
  apiMock.apiClient.claimAndLoadBallot
    .expectRepeatedCallsWith({})
    .resolves(err({ type: 'host-disconnect' }));

  renderScreen();

  await screen.findByText('Disconnected from host.');
  screen.getByText('Exit');
});

test('redirects when host disables adjudication', async () => {
  // Data loader queries fire before the redirect.
  expectDataLoaderQueries('cvr-1');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');

  const { history } = renderScreen({ adjudicationEnabled: false });

  await waitFor(() =>
    expect(history.location.pathname).toEqual(routerPaths.adjudication)
  );
});

test('redirects when the host disables adjudication mid-session', async () => {
  expectDataLoaderQueries('cvr-1');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');
  const { history } = renderScreen();

  // The session is active and a ballot is loaded
  await screen.findByText('Adjudicating cvr-1');

  // The host disables client adjudication — the polled session status query
  // picks up the change and the screen redirects within a refetch interval
  apiMock.apiClient.getAdjudicationSessionStatus.reset();
  apiMock.apiClient.getAdjudicationSessionStatus
    .expectRepeatedCallsWith()
    .resolves({ isClientAdjudicationEnabled: false });

  await waitFor(
    () => expect(history.location.pathname).toEqual(routerPaths.adjudication),
    { timeout: 3000 }
  );
  expect(screen.queryByText('Adjudicating cvr-1')).toBeNull();
});

test('onAccept calls API and accept advances', async () => {
  expectDataLoaderQueries('cvr-1');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');
  renderScreen();
  await screen.findByText('Adjudicating cvr-1');

  const mockInput = { cvrId: 'cvr-1', contests: [] } as const;
  apiMock.apiClient.adjudicateCvr.expectCallWith(mockInput).resolves(ok());
  const onAccept = capturedProps['onAccept'] as (
    input: unknown
  ) => Promise<void>;
  await onAccept(mockInput);

  // Then accept advances to next (no more ballots; backend wraps and finds
  // none in one call)
  apiMock.apiClient.claimAndLoadBallot
    .expectCallWith({ afterCvrId: 'cvr-1' })
    .resolves(ok(undefined));
  screen.getByText('Accept').click();
  await screen.findByText('No more ballots available for adjudication.');
});

test('onAccept error shows error screen', async () => {
  expectDataLoaderQueries('cvr-1');
  expectGlobalDataLoaderQueries();
  expectInitialClaimAndLoad('cvr-1');
  renderScreen();
  await screen.findByText('Adjudicating cvr-1');

  const mockInput = { cvrId: 'cvr-1', contests: [] } as const;
  apiMock.apiClient.adjudicateCvr
    .expectCallWith(mockInput)
    .resolves(err({ type: 'claim-failed' }));
  const onAccept = capturedProps['onAccept'] as (
    input: unknown
  ) => Promise<void>;
  await expect(onAccept(mockInput)).rejects.toThrow();

  await screen.findByText(
    'This machine no longer has an active claim on this ballot. Please try again.'
  );
});
