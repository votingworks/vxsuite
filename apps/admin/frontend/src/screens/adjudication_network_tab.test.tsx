import { afterEach, beforeEach, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  mockSessionExpiresAt,
  mockElectionManagerUser,
} from '@votingworks/test-utils';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  DippedSmartCardAuth,
  UserRole,
  constructElectionKey,
} from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { AdjudicationNetworkTab } from './adjudication_network_tab';
import { MachineStatus } from '../types';

const featureFlagMock = getFeatureFlagMock();
const electionDefinition = readElectionGeneralDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );
});

afterEach(() => {
  apiMock.assertComplete();
  featureFlagMock.resetFeatureFlags();
});

const auth: DippedSmartCardAuth.ElectionManagerLoggedIn = {
  status: 'logged_in',
  user: mockElectionManagerUser({
    electionKey: constructElectionKey(electionDefinition.election),
  }),
  sessionExpiresAt: mockSessionExpiresAt(),
};

function mockNetworkStatus(
  overrides: {
    isOnline?: boolean;
    connectedClients?: Array<{
      machineId: string;
      machineMode: 'client';
      status: MachineStatus;
      authType: UserRole | null;
      lastSeenAt: number;
    }>;
  } = {}
) {
  apiMock.apiClient.getNetworkStatus.expectRepeatedCallsWith().resolves({
    isOnline: overrides.isOnline ?? true,
    connectedClients: overrides.connectedClients ?? [],
  });
}

function mockAdjudicationEnabled(enabled: boolean) {
  apiMock.apiClient.getIsClientAdjudicationEnabled
    .expectRepeatedCallsWith()
    .resolves(enabled);
}

test('shows disabled state and toggle button', async () => {
  mockNetworkStatus();
  mockAdjudicationEnabled(false);
  renderInAppContext(<AdjudicationNetworkTab />, {
    apiMock,
    auth,
    electionDefinition,
  });
  await screen.findByText(/Multi-station adjudication is disabled/);
  screen.getByRole('button', {
    name: 'Enable Multi-Station Adjudication',
  });
});

test('shows enabled state', async () => {
  mockNetworkStatus();
  mockAdjudicationEnabled(true);
  renderInAppContext(<AdjudicationNetworkTab />, {
    apiMock,
    auth,
    electionDefinition,
  });
  await screen.findByText(/Multi-station adjudication is enabled/);
  screen.getByRole('button', {
    name: 'Disable Multi-Station Adjudication',
  });
});

test('shows network online status', async () => {
  mockNetworkStatus({ isOnline: true });
  mockAdjudicationEnabled(false);
  renderInAppContext(<AdjudicationNetworkTab />, {
    apiMock,
    auth,
    electionDefinition,
  });
  await screen.findByText('Online');
});

test('shows network offline status', async () => {
  mockNetworkStatus({ isOnline: false });
  mockAdjudicationEnabled(false);
  renderInAppContext(<AdjudicationNetworkTab />, {
    apiMock,
    auth,
    electionDefinition,
  });
  await screen.findByText('Offline');
});

test('shows clients with status and auth type', async () => {
  mockNetworkStatus({
    connectedClients: [
      {
        machineId: 'CLIENT-001',
        machineMode: 'client',
        status: MachineStatus.OnlineLocked,
        authType: null,
        lastSeenAt: Date.now(),
      },
      {
        machineId: 'CLIENT-002',
        machineMode: 'client',
        status: MachineStatus.Active,
        authType: 'election_manager',
        lastSeenAt: Date.now(),
      },
    ],
  });
  mockAdjudicationEnabled(false);
  renderInAppContext(<AdjudicationNetworkTab />, {
    apiMock,
    auth,
    electionDefinition,
  });
  await screen.findByText('CLIENT-001');
  screen.getByText('CLIENT-002');
  screen.getByText('Locked');
  screen.getByText('Active');
  screen.getByText('Election Manager');
});

test('shows disconnected client', async () => {
  mockNetworkStatus({
    connectedClients: [
      {
        machineId: 'CLIENT-001',
        machineMode: 'client',
        status: MachineStatus.Offline,
        authType: null,
        lastSeenAt: Date.now(),
      },
    ],
  });
  mockAdjudicationEnabled(false);
  renderInAppContext(<AdjudicationNetworkTab />, {
    apiMock,
    auth,
    electionDefinition,
  });
  await screen.findByText('CLIENT-001');
  screen.getByText('Disconnected');
});

test('shows empty state when no clients connected', async () => {
  mockNetworkStatus();
  mockAdjudicationEnabled(false);
  renderInAppContext(<AdjudicationNetworkTab />, {
    apiMock,
    auth,
    electionDefinition,
  });
  await screen.findByText('No clients have connected.');
});

test('toggles adjudication enabled state', async () => {
  mockNetworkStatus();
  mockAdjudicationEnabled(false);
  renderInAppContext(<AdjudicationNetworkTab />, {
    apiMock,
    auth,
    electionDefinition,
  });
  const enableButton = await screen.findByRole('button', {
    name: 'Enable Multi-Station Adjudication',
  });
  apiMock.apiClient.setIsClientAdjudicationEnabled
    .expectCallWith({ enabled: true })
    .resolves();
  userEvent.click(enableButton);
});
