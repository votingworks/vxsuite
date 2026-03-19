import { afterEach, beforeEach, expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import {
  DippedSmartCardAuth,
  constructElectionKey,
  ElectionDefinition,
} from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { QueryClientProvider } from '@tanstack/react-query';
import { SystemCallContextProvider, mockUsbDriveStatus } from '@votingworks/ui';
import { BrowserRouter } from 'react-router-dom';
import { screen, render } from '../../../test/react_testing_library';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import {
  ApiClientContext as ClientApiClientContext,
  createQueryClient,
  type ApiClient,
} from '../api';
import { AppContext } from '../../contexts/app_context';
import { ClientSettingsScreen } from './client_settings_screen';
import {
  ApiClientContext as HostApiClientContext,
  systemCallApi as hostSystemCallApi,
} from '../../api';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderSettingsScreen(options: {
  auth: DippedSmartCardAuth.AuthStatus;
  electionDefinition?: ElectionDefinition;
}) {
  const clientApiClient = apiMock.apiClient as unknown as ApiClient;
  return render(
    <HostApiClientContext.Provider value={apiMock.apiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <SystemCallContextProvider api={hostSystemCallApi}>
          <ClientApiClientContext.Provider value={clientApiClient}>
            <AppContext.Provider
              value={{
                auth: options.auth,
                machineConfig: { machineId: '0000', codeVersion: 'dev' },
                isOfficialResults: false,
                usbDriveStatus: mockUsbDriveStatus('no_drive'),
                electionDefinition: options.electionDefinition,
                electionPackageHash: options.electionDefinition
                  ? 'test-election-package-hash'
                  : undefined,
              }}
            >
              <BrowserRouter>
                <ClientSettingsScreen />
              </BrowserRouter>
            </AppContext.Provider>
          </ClientApiClientContext.Provider>
        </SystemCallContextProvider>
      </QueryClientProvider>
    </HostApiClientContext.Provider>
  );
}

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
  renderSettingsScreen({ auth: sysAdminAuth });
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
  renderSettingsScreen({ auth: emAuth });
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
  renderSettingsScreen({ auth: sysAdminAuth });
  await screen.findByText(/Offline/);
});

test('shows searching for host status', async () => {
  apiMock.expectGetUsbPortStatus();
  expectNetworkStatus('online-waiting-for-host');
  renderSettingsScreen({ auth: sysAdminAuth });
  await screen.findByText(/Searching for host/);
});

test('does not show Switch to Host Mode when election is configured', async () => {
  apiMock.expectGetUsbPortStatus();
  expectNetworkStatus('online-connected-to-host');
  const electionDefinition = readElectionGeneralDefinition();
  renderSettingsScreen({ auth: sysAdminAuth, electionDefinition });
  await screen.findByRole('heading', { name: 'Settings' });
  expect(
    screen.queryByRole('button', { name: 'Switch to Host Mode' })
  ).not.toBeInTheDocument();
});

test('shows restart screen after switching to host mode', async () => {
  apiMock.expectGetUsbPortStatus();
  expectNetworkStatus('online-connected-to-host');
  renderSettingsScreen({ auth: sysAdminAuth });
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
