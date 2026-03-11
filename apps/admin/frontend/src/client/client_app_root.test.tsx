import { afterEach, beforeEach, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { constructElectionKey } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { QueryClientProvider } from '@tanstack/react-query';
import { SystemCallContextProvider } from '@votingworks/ui';
import { screen, render } from '../../test/react_testing_library';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ClientApp } from './client_app';
import { createQueryClient, type ApiClient } from './api';
import {
  ApiClientContext as HostApiClientContext,
  systemCallApi,
} from '../api';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
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

function renderClientApp() {
  apiMock.expectGetMachineConfig();
  const clientApiClient = apiMock.apiClient as unknown as ApiClient;
  // Add getNetworkConnectionStatus mock since it only exists on ClientApi
  if (!('getNetworkConnectionStatus' in clientApiClient)) {
    Object.assign(clientApiClient, {
      getNetworkConnectionStatus: vi
        .fn()
        .mockResolvedValue({ status: 'offline' }),
    });
  }
  // Provide both HostApiClientContext (for systemCallApi) and ClientApp's context
  return render(
    <HostApiClientContext.Provider value={apiMock.apiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <SystemCallContextProvider api={systemCallApi}>
          <ClientApp apiClient={clientApiClient} />
        </SystemCallContextProvider>
      </QueryClientProvider>
    </HostApiClientContext.Provider>
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

test('shows locked screen when machine is locked', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  renderClientApp();
  await screen.findByText('VxAdmin Locked');
  await screen.findByText('Insert system administrator card to unlock.');
});

test('shows locked screen on session expiry', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked_by_session_expiry',
  });
  renderClientApp();
  await screen.findByText('VxAdmin Locked');
});

test('shows invalid card screen for non-system-admin cards', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
  });
  renderClientApp();
  await screen.findByText(/Use a system administrator card/);
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

test('shows invalid card for logged-in election manager', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(electionDefinition.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  renderClientApp();
  await screen.findByText(/Use a system administrator card/);
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

test('shows main screen when logged in as system administrator', async () => {
  setSystemAdminAuth();
  renderClientApp();
  await screen.findByText('VxAdmin Client');
  await screen.findByText('Offline');
});

test('shows waiting for host status', async () => {
  setSystemAdminAuth();
  const clientApiClient = apiMock.apiClient as unknown as ApiClient;
  Object.assign(clientApiClient, {
    getNetworkConnectionStatus: vi
      .fn()
      .mockResolvedValue({ status: 'online-waiting-for-host' }),
  });
  renderClientApp();
  await screen.findByText(/Online — Waiting for host/);
});

test('shows connected to host status', async () => {
  setSystemAdminAuth();
  const clientApiClient = apiMock.apiClient as unknown as ApiClient;
  Object.assign(clientApiClient, {
    getNetworkConnectionStatus: vi.fn().mockResolvedValue({
      status: 'online-connected-to-host',
      hostMachineId: '0001',
    }),
  });
  renderClientApp();
  await screen.findByText(/Online — Connected to host machine: 0001/);
});

test('switching to host mode shows restart screen', async () => {
  setSystemAdminAuth();
  renderClientApp();
  const switchButton = await screen.findByRole('button', {
    name: 'Switch to Host Mode',
  });
  apiMock.apiClient.setMachineMode.expectCallWith({ mode: 'host' }).resolves();
  userEvent.click(switchButton);
  await screen.findByText('Machine mode changed. Restart is required.');
  screen.getByRole('button', { name: 'Power Down' });
});

test('can lock machine from main screen', async () => {
  setSystemAdminAuth();
  renderClientApp();

  const lockButton = await screen.findByRole('button', {
    name: 'Lock Machine',
  });
  apiMock.apiClient.logOut.expectCallWith().resolves();
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  userEvent.click(lockButton);
  await screen.findByText('VxAdmin Locked');
});
