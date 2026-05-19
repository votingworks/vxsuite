import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, within } from '@testing-library/react';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { constructElectionKey } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { QueryClient } from '@tanstack/react-query';
import { SystemCallContextProvider } from '@votingworks/ui';
import { screen, render } from '../../test/react_testing_library';
import {
  ClientApiMock,
  createClientApiMock,
} from '../../test/helpers/mock_client_api_client';
import { ClientApp } from './client_app';
import { createQueryClient, type ApiClient } from './api';
import { SharedApiClientContext, systemCallApi } from '../shared_api';

// Stub the ballot adjudication screen so the URL-clearing test doesn't have to
// wire up its data-loader queries — the behavior under test lives in
// ClientAppRoot.
vi.mock('./screens/client_ballot_adjudication_screen', () => ({
  ClientBallotAdjudicationScreen: () => (
    <div>mock ballot adjudication screen</div>
  ),
}));

let apiMock: ClientApiMock;
let queryClient: QueryClient;

const electionDefinition = readElectionGeneralDefinition();

beforeEach(() => {
  apiMock = createClientApiMock();
  queryClient = createQueryClient();
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  apiMock.assertComplete();
});

function setSystemAdminAuth() {
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  });
}

function setElectionManagerAuth() {
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(electionDefinition.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
}

function setPollWorkerAuth() {
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockPollWorkerUser({
      electionKey: constructElectionKey(electionDefinition.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
}

function renderClientApp({
  withElection = false,
}: { withElection?: boolean } = {}) {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetCurrentElectionMetadata(
    withElection ? { electionDefinition } : null
  );
  apiMock.expectGetUsbDriveStatus('no_drive');
  // Mounted by SessionTimeLimitTracker at ClientApp's root.
  apiMock.expectGetSystemSettings();

  const clientApiClient = apiMock.apiClient as unknown as ApiClient;
  return render(
    <SharedApiClientContext.Provider value={clientApiClient}>
      <SystemCallContextProvider api={systemCallApi}>
        <ClientApp apiClient={clientApiClient} queryClient={queryClient} />
      </SystemCallContextProvider>
    </SharedApiClientContext.Provider>
  );
}

test('shows setup card reader page when no card reader', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'no_card_reader',
  });
  renderClientApp();
  await screen.findByText('Card Reader Not Detected');
});

test('shows locked screen when machine is locked without election', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  renderClientApp();
  await screen.findByText('VxAdmin Locked');
  await screen.findByText('Insert system administrator card to unlock.');
});

test('shows locked screen with election info when election is loaded', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  renderClientApp({ withElection: true });
  await screen.findByText('VxAdmin Locked');
  screen.getByText(electionDefinition.election.title);
});

test('shows locked screen on session expiry', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked_by_session_expiry',
  });
  renderClientApp();
  await screen.findByText('VxAdmin Locked');
});

test('shows invalid card screen without election', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
  });
  renderClientApp();
  await screen.findByText(/Use a system administrator card\./);
});

test('shows invalid card screen mentioning valid roles when election is loaded', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
  });
  renderClientApp({ withElection: true });
  await screen.findByText(/Use an election manager or poll worker card\./);
});

test('shows unlock screen when checking pin', async () => {
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockSystemAdministratorUser(),
    lockedOutUntil: undefined,
    wrongPinEnteredAt: undefined,
  });
  renderClientApp();
  await screen.findByText('Enter Card PIN');
});

test('shows remove card screen after authentication', async () => {
  apiMock.setAuthStatus({
    status: 'remove_card',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  renderClientApp();
  await screen.findByText(/Remove card to unlock/i);
});

test('shows adjudication screen with election info when logged in as poll worker', async () => {
  setPollWorkerAuth();
  apiMock.expectGetAdjudicationSessionStatus();
  renderClientApp({ withElection: true });
  await screen.findByRole('heading', { name: 'Adjudication' });
  screen.getByText(electionDefinition.election.title);
});

test('poll worker sees only adjudication tab', async () => {
  setPollWorkerAuth();
  apiMock.expectGetAdjudicationSessionStatus();
  renderClientApp({ withElection: true });
  await screen.findByRole('heading', { name: 'Adjudication' });
  screen.getByRole('button', { name: 'Adjudication' });
  expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Diagnostics' })).toBeNull();
});

test('election manager sees adjudication, settings, and diagnostics tabs', async () => {
  setElectionManagerAuth();
  apiMock.expectGetAdjudicationSessionStatus();
  renderClientApp({ withElection: true });
  await screen.findByRole('heading', { name: 'Adjudication' });
  screen.getByRole('button', { name: 'Adjudication' });
  screen.getByRole('button', { name: 'Settings' });
  screen.getByRole('button', { name: 'Diagnostics' });
});

test('shows settings screen when logged in as system administrator', async () => {
  setSystemAdminAuth();
  apiMock.expectGetNetworkConnectionStatus('online-connected-to-host');
  apiMock.expectGetUsbPortStatus();
  renderClientApp();
  await screen.findByRole('heading', { name: 'Settings' });
});

test('sysadmin sees settings and diagnostics tabs but not adjudication', async () => {
  setSystemAdminAuth();
  apiMock.expectGetNetworkConnectionStatus('online-connected-to-host');
  apiMock.expectGetUsbPortStatus();
  renderClientApp();
  await screen.findByRole('heading', { name: 'Settings' });
  screen.getByRole('button', { name: 'Settings' });
  screen.getByRole('button', { name: 'Diagnostics' });
  screen.getByRole('button', { name: 'Lock Machine' });
  expect(screen.queryByRole('button', { name: 'Adjudication' })).toBeNull();
});

test('shows low battery alert when battery is low and discharging', async () => {
  setSystemAdminAuth();
  apiMock.expectGetNetworkConnectionStatus('online-connected-to-host');
  apiMock.expectGetUsbPortStatus();
  apiMock.setBatteryInfo({ level: 0.1, discharging: true });
  renderClientApp();

  const warning = await screen.findByRole('alertdialog');
  within(warning).getByText('Low Battery');
});

test('shows low disk space warning when disk space is low', async () => {
  setSystemAdminAuth();
  apiMock.expectGetNetworkConnectionStatus('online-connected-to-host');
  apiMock.expectGetUsbPortStatus();
  apiMock.setDiskSpaceSummary({
    total: 100_000_000,
    used: 99_900_000,
    available: 100_000,
  });
  renderClientApp();

  const warning = await screen.findByRole('alertdialog');
  within(warning).getByText('Low Disk Space');
});

test('logout while on a ballot adjudication URL replaces it with the home route', async () => {
  // Seed the URL so the app starts on /adjudication/ballots/<cvrId>.
  window.history.replaceState({}, '', '/adjudication/ballots/cvr-1');

  setPollWorkerAuth();
  renderClientApp({ withElection: true });
  await screen.findByText('mock ballot adjudication screen');

  // Logout (manual lock or session expiry while still connected). The
  // transition useEffect should rewrite the URL to /adjudication so re-auth
  // lands on the home screen instead of reopening the stale ballot.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked_by_session_expiry',
  });
  await screen.findByText('VxAdmin Locked');
  expect(window.location.pathname).toEqual('/adjudication');
});
