import { afterEach, beforeEach, test } from 'vitest';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';
import { screen } from '../../../test/react_testing_library.js';
import {
  ClientApiMock,
  createClientApiMock,
} from '../../../test/helpers/mock_client_api_client.js';
import { renderInClientContext } from '../../../test/render_in_client_context.js';
import { ClientDiagnosticsScreen } from './client_diagnostics_screen.js';

let apiMock: ClientApiMock;

beforeEach(() => {
  apiMock = createClientApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const sysAdminAuth: DippedSmartCardAuth.SystemAdministratorLoggedIn = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
  programmableCard: { status: 'no_card' },
};

test('shows diagnostics sections and battery info', async () => {
  apiMock.apiClient.getBatteryInfo.mockResolvedValue({
    level: 0.75,
    discharging: true,
  });
  apiMock.expectGetNetworkConnectionStatus('online-connected-to-host', '0001');
  renderInClientContext(<ClientDiagnosticsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  await screen.findByRole('heading', { name: 'Diagnostics' });
  screen.getByRole('heading', { name: 'Storage' });
  screen.getByRole('heading', { name: 'Battery' });
  screen.getByText(/Battery Level: 75%/);
  screen.getByRole('heading', { name: 'Network' });
  await screen.findByText(/Online — VxAdmin \(0001\) connected on the network/);
});

test('shows offline status', async () => {
  apiMock.expectGetNetworkConnectionStatus('offline');
  renderInClientContext(<ClientDiagnosticsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  await screen.findByText(/Offline/);
});

test('shows waiting for host status', async () => {
  apiMock.expectGetNetworkConnectionStatus('online-waiting-for-host');
  renderInClientContext(<ClientDiagnosticsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  await screen.findByText(/Online — no VxAdmin detected on the network/);
});

test('shows multiple hosts detected warning', async () => {
  apiMock.expectGetNetworkConnectionStatus('online-multiple-hosts-detected');
  renderInClientContext(<ClientDiagnosticsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  await screen.findByText(/Multiple VxAdmins detected/);
});

test('shows incompatible host version warning', async () => {
  apiMock.expectGetNetworkConnectionStatus('online-incompatible-host-version');
  renderInClientContext(<ClientDiagnosticsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  await screen.findByText(/running a different software version/);
});
