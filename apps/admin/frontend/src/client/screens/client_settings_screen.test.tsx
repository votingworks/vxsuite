import { afterEach, beforeEach, expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, constructElectionKey } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { screen } from '../../../test/react_testing_library';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInClientContext } from '../../../test/render_in_client_context';
import { ClientSettingsScreen } from './client_settings_screen';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
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

function expectNetworkStatus(
  status: 'offline' | 'online-waiting-for-host' | 'online-connected-to-host',
  hostMachineId?: string
) {
  const value =
    status === 'online-connected-to-host'
      ? { status, hostMachineId: hostMachineId ?? '0001' }
      : { status };
  // getNetworkConnectionStatus exists on ClientApi but not host Api;
  // the grout mock client Proxy auto-creates it at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (apiMock.apiClient as any).getNetworkConnectionStatus
    .expectRepeatedCallsWith()
    .resolves(value);
}

test('renders settings screen for system administrator', async () => {
  apiMock.expectGetUsbPortStatus();
  expectNetworkStatus('online-connected-to-host', '0001');
  renderInClientContext(<ClientSettingsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  await screen.findByRole('heading', { name: 'Settings' });
  screen.getByRole('heading', { name: 'Network' });
  await screen.findByText(/Connected to host 0001/);
  screen.getByRole('heading', { name: 'Logs' });
  screen.getByRole('heading', { name: 'Date and Time' });
  screen.getByRole('heading', { name: 'USB Formatting' });
  screen.getByRole('heading', { name: 'Security' });
  screen.getByRole('heading', { name: 'Machine Mode' });
  screen.getByRole('button', { name: 'Switch to Host Mode' });
});

test('renders settings screen for election manager (fewer sections)', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  const emAuth: DippedSmartCardAuth.ElectionManagerLoggedIn = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(electionDefinition.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };
  renderInClientContext(<ClientSettingsScreen />, {
    auth: emAuth,
    apiMock,
  });
  await screen.findByRole('heading', { name: 'Settings' });
  screen.getByRole('heading', { name: 'Logs' });
  // EM does not see Network, USB Formatting, or Machine Mode sections
  expect(
    screen.queryByRole('heading', { name: 'Network' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'USB Formatting' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Machine Mode' })
  ).not.toBeInTheDocument();
});

test('shows offline status', async () => {
  apiMock.expectGetUsbPortStatus();
  expectNetworkStatus('offline');
  renderInClientContext(<ClientSettingsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  await screen.findByText(/Offline/);
});

test('shows searching for host status', async () => {
  apiMock.expectGetUsbPortStatus();
  expectNetworkStatus('online-waiting-for-host');
  renderInClientContext(<ClientSettingsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  await screen.findByText(/Searching for host/);
});

test('does not show Switch to Host Mode when election is configured', async () => {
  apiMock.expectGetUsbPortStatus();
  expectNetworkStatus('online-connected-to-host');
  const electionDefinition = readElectionGeneralDefinition();
  renderInClientContext(<ClientSettingsScreen />, {
    auth: sysAdminAuth,
    electionDefinition,
    apiMock,
  });
  await screen.findByRole('heading', { name: 'Settings' });
  expect(
    screen.queryByRole('button', { name: 'Switch to Host Mode' })
  ).not.toBeInTheDocument();
});

test('shows restart screen after switching to host mode', async () => {
  apiMock.expectGetUsbPortStatus();
  expectNetworkStatus('online-connected-to-host');
  renderInClientContext(<ClientSettingsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  const switchButton = await screen.findByRole('button', {
    name: 'Switch to Host Mode',
  });
  apiMock.apiClient.setMachineMode.expectCallWith({ mode: 'host' }).resolves();
  userEvent.click(switchButton);
  await screen.findByText(
    'Machine mode changed, restart the machine to continue.'
  );
  screen.getByRole('button', { name: 'Power Down' });
});
