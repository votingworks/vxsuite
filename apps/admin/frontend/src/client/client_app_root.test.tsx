import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup } from '@testing-library/react';
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
import { screen, render } from '../../test/react_testing_library.js';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client.js';
import { ClientApp } from './client_app.js';
import { createQueryClient, type ApiClient } from './api.js';
import { SharedApiClientContext, systemCallApi } from '../shared_api.js';

let apiMock: ApiMock;
let queryClient: QueryClient;

const electionDefinition = readElectionGeneralDefinition();

beforeEach(() => {
  apiMock = createApiMock();
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

function expectNetworkConnected() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (apiMock.apiClient as any).getNetworkConnectionStatus
    .expectRepeatedCallsWith()
    .resolves({ status: 'online-connected-to-host', hostMachineId: '0001' });
}

function renderClientApp({
  withElection = false,
}: { withElection?: boolean } = {}) {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetCurrentElectionMetadata(
    withElection ? { electionDefinition } : null
  );
  apiMock.expectGetUsbDriveStatus('no_drive');

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
  expectNetworkConnected();
  renderClientApp({ withElection: true });
  await screen.findByRole('heading', { name: 'Adjudication' });
  screen.getByText(electionDefinition.election.title);
});

test('poll worker sees only adjudication tab', async () => {
  setPollWorkerAuth();
  expectNetworkConnected();
  renderClientApp({ withElection: true });
  await screen.findByRole('heading', { name: 'Adjudication' });
  screen.getByRole('button', { name: 'Adjudication' });
  expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Diagnostics' })).toBeNull();
});

test('election manager sees adjudication, settings, and diagnostics tabs', async () => {
  setElectionManagerAuth();
  expectNetworkConnected();
  renderClientApp({ withElection: true });
  await screen.findByRole('heading', { name: 'Adjudication' });
  screen.getByRole('button', { name: 'Adjudication' });
  screen.getByRole('button', { name: 'Settings' });
  screen.getByRole('button', { name: 'Diagnostics' });
});

test('shows settings screen when logged in as system administrator', async () => {
  setSystemAdminAuth();
  expectNetworkConnected();
  apiMock.expectGetUsbPortStatus();
  renderClientApp();
  await screen.findByRole('heading', { name: 'Settings' });
});

test('sysadmin sees settings and diagnostics tabs but not adjudication', async () => {
  setSystemAdminAuth();
  expectNetworkConnected();
  apiMock.expectGetUsbPortStatus();
  renderClientApp();
  await screen.findByRole('heading', { name: 'Settings' });
  screen.getByRole('button', { name: 'Settings' });
  screen.getByRole('button', { name: 'Diagnostics' });
  screen.getByRole('button', { name: 'Lock Machine' });
  expect(screen.queryByRole('button', { name: 'Adjudication' })).toBeNull();
});
