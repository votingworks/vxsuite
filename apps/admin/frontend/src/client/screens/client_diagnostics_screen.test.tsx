import { afterEach, beforeEach, test } from 'vitest';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';
import { screen } from '../../../test/react_testing_library';
import {
  ClientApiMock,
  createClientApiMock,
} from '../../../test/helpers/mock_client_api_client';
import { renderInClientContext } from '../../../test/render_in_client_context';
import { ClientDiagnosticsScreen } from './client_diagnostics_screen';

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
  renderInClientContext(<ClientDiagnosticsScreen />, {
    auth: sysAdminAuth,
    apiMock,
  });
  await screen.findByRole('heading', { name: 'Diagnostics' });
  screen.getByRole('heading', { name: 'Storage' });
  screen.getByRole('heading', { name: 'Battery' });
  screen.getByText(/Battery Level: 75%/);
});
