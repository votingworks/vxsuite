import { afterEach, beforeEach, test } from 'vitest';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';
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
import { ClientDiagnosticsScreen } from './client_diagnostics_screen';
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

const sysAdminAuth: DippedSmartCardAuth.SystemAdministratorLoggedIn = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
  programmableCard: { status: 'no_card' },
};

function renderDiagnosticsScreen() {
  const clientApiClient = apiMock.apiClient as unknown as ApiClient;
  return render(
    <HostApiClientContext.Provider value={apiMock.apiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <SystemCallContextProvider api={hostSystemCallApi}>
          <ClientApiClientContext.Provider value={clientApiClient}>
            <AppContext.Provider
              value={{
                auth: sysAdminAuth,
                machineConfig: { machineId: '0000', codeVersion: 'dev' },
                isOfficialResults: false,
                usbDriveStatus: mockUsbDriveStatus('no_drive'),
              }}
            >
              <BrowserRouter>
                <ClientDiagnosticsScreen />
              </BrowserRouter>
            </AppContext.Provider>
          </ClientApiClientContext.Provider>
        </SystemCallContextProvider>
      </QueryClientProvider>
    </HostApiClientContext.Provider>
  );
}

test('shows diagnostics sections and battery info', async () => {
  apiMock.setBatteryInfo({ level: 0.75, discharging: true });
  renderDiagnosticsScreen();
  await screen.findByRole('heading', { name: 'Diagnostics' });
  screen.getByRole('heading', { name: 'Storage' });
  screen.getByRole('heading', { name: 'Battery' });
  screen.getByText(/Battery Level: 75%/);
});
