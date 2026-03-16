import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, constructElectionKey } from '@votingworks/types';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { ok } from '@votingworks/basics';
import { AdminConnectionStatus } from '../types';
import { screen, within } from '../../test/react_testing_library';

import {
  eitherNeitherElectionDefinition,
  renderInAppContext,
} from '../../test/render_in_app_context';
import { SettingsScreen } from './settings_screen';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

const featureFlagMock = vi.hoisted(() => {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const { getFeatureFlagMock } = require('@votingworks/utils');
  return getFeatureFlagMock();
});
vi.mock('@votingworks/utils', async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date('2022-06-22T00:00:00'),
  });
  apiMock = createApiMock();
});

afterEach(() => {
  vi.useRealTimers();
  apiMock.assertComplete();
});

describe('as System Admin', () => {
  const auth: DippedSmartCardAuth.SystemAdministratorLoggedIn = {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };

  test('Setting current date and time', async () => {
    apiMock.expectGetUsbPortStatus();
    renderInAppContext(<SettingsScreen />, { apiMock, auth });

    screen.getByRole('heading', { name: 'Date and Time' });

    // Clock setting is tested fully in libs/ui/src/set_clock.test.tsx
    userEvent.click(screen.getByRole('button', { name: 'Set Date and Time' }));
    const modal = screen.getByRole('alertdialog');
    within(modal).getByText('Wed, Jun 22, 2022, 12:00 AM AKDT');
    userEvent.selectOptions(within(modal).getByTestId('selectYear'), '2023');
    apiMock.apiClient.setClock
      .expectCallWith({
        isoDatetime: '2023-06-22T00:00:00.000-08:00',
        ianaZone: 'America/Anchorage',
      })
      .resolves();
    apiMock.expectLogOut();
    userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  test('Exporting logs', async () => {
    apiMock.expectGetUsbPortStatus();
    renderInAppContext(<SettingsScreen />, {
      apiMock,
      auth,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    });

    apiMock.apiClient.exportLogsToUsb
      .expectCallWith({ format: 'vxf' })
      .resolves(ok());

    // Log saving is tested fully in src/components/export_logs_modal.test.tsx
    userEvent.click(screen.getButton('Save Logs'));
    await screen.findByText('Select a log format:');
    userEvent.click(screen.getButton('Save'));
    userEvent.click(await screen.findButton('Close'));
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });
});

describe('multi-station mode', () => {
  const auth: DippedSmartCardAuth.SystemAdministratorLoggedIn = {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };

  beforeEach(() => {
    featureFlagMock.enableFeatureFlag(
      BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
    );
  });

  afterEach(() => {
    featureFlagMock.resetFeatureFlags();
  });

  function mockNetworkStatusQuery(
    networkStatus: {
      isOnline: boolean;
      connectedClients: Array<{
        machineId: string;
        machineMode: 'client';
        status: AdminConnectionStatus;
        lastSeenAt: number;
      }>;
    } = { isOnline: true, connectedClients: [] }
  ) {
    apiMock.apiClient.getNetworkStatus
      .expectRepeatedCallsWith()
      .resolves(networkStatus);
  }

  test('shows switch to client mode button when unconfigured', () => {
    apiMock.expectGetUsbPortStatus();
    mockNetworkStatusQuery();
    renderInAppContext(<SettingsScreen />, {
      apiMock,
      auth,
      electionDefinition: null,
    });
    screen.getByRole('heading', { name: 'Multi-Station Mode' });
    screen.getByRole('button', { name: 'Switch to Client Mode' });
  });

  test('shows online network status', async () => {
    apiMock.expectGetUsbPortStatus();
    mockNetworkStatusQuery();
    renderInAppContext(<SettingsScreen />, { apiMock, auth });
    await screen.findByText('Network: Online');
  });

  test('shows offline network status', async () => {
    apiMock.expectGetUsbPortStatus();
    mockNetworkStatusQuery({ isOnline: false, connectedClients: [] });
    renderInAppContext(<SettingsScreen />, { apiMock, auth });
    await screen.findByText('Network: Offline');
  });

  test('shows connected clients button when configured', async () => {
    apiMock.expectGetUsbPortStatus();
    mockNetworkStatusQuery({
      isOnline: true,
      connectedClients: [
        {
          machineId: 'client-001',
          machineMode: 'client',
          status: AdminConnectionStatus.Connected,
          lastSeenAt: Date.now(),
        },
      ],
    });
    renderInAppContext(<SettingsScreen />, { apiMock, auth });
    screen.getByRole('heading', { name: 'Multi-Station Mode' });
    await screen.findByRole('button', {
      name: 'View Connected Clients (1)',
    });
  });

  test('opens and closes connected clients modal', async () => {
    apiMock.expectGetUsbPortStatus();
    mockNetworkStatusQuery({
      isOnline: true,
      connectedClients: [
        {
          machineId: 'client-001',
          machineMode: 'client',
          status: AdminConnectionStatus.Connected,
          lastSeenAt: Date.now(),
        },
      ],
    });
    renderInAppContext(<SettingsScreen />, { apiMock, auth });
    userEvent.click(
      await screen.findByRole('button', {
        name: 'View Connected Clients (1)',
      })
    );
    await screen.findByText('Connected Clients');
    screen.getByText('client-001');
    userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await vi.waitFor(() =>
      expect(screen.queryByText('Connected Clients')).not.toBeInTheDocument()
    );
  });

  test('shows empty state in connected clients modal', async () => {
    apiMock.expectGetUsbPortStatus();
    mockNetworkStatusQuery();
    renderInAppContext(<SettingsScreen />, { apiMock, auth });
    userEvent.click(
      await screen.findByRole('button', {
        name: 'View Connected Clients (0)',
      })
    );
    await screen.findByText('No clients are currently connected.');
  });

  test('shows restart screen after switching mode', async () => {
    apiMock.expectGetUsbPortStatus();
    mockNetworkStatusQuery();
    renderInAppContext(<SettingsScreen />, {
      apiMock,
      auth,
      electionDefinition: null,
    });
    apiMock.apiClient.setMachineMode
      .expectCallWith({ mode: 'client' })
      .resolves();
    userEvent.click(
      screen.getByRole('button', { name: 'Switch to Client Mode' })
    );
    await screen.findByText(
      'Machine mode changed, restart the machine to continue.'
    );
    screen.getByRole('button', { name: 'Power Down' });
  });
});

describe('as election manager', () => {
  const auth: DippedSmartCardAuth.ElectionManagerLoggedIn = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(
        eitherNeitherElectionDefinition.election
      ),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  test('Date and time', () => {
    renderInAppContext(<SettingsScreen />, { apiMock, auth });
    screen.getByRole('heading', { name: 'Date and Time' });
    userEvent.click(screen.getByRole('button', { name: 'Set Date and Time' }));
    userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // Clock setting is tested fully in libs/ui/src/set_clock.test.tsx

    // Shouldn't have System-Admin-only sections
    expect(
      screen.queryByRole('heading', { name: 'Software Update' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'USB Formatting' })
    ).not.toBeInTheDocument();
  });

  test('Exporting logs', async () => {
    renderInAppContext(<SettingsScreen />, {
      apiMock,
      auth,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    });

    apiMock.apiClient.exportLogsToUsb
      .expectCallWith({ format: 'vxf' })
      .resolves(ok());

    // Log saving is tested fully in src/components/export_logs_modal.test.tsx
    userEvent.click(screen.getButton('Save Logs'));
    await screen.findByText('Select a log format:');
    userEvent.click(screen.getButton('Save'));
    userEvent.click(await screen.findButton('Close'));
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });
});
