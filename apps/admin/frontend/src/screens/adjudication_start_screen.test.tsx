import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { sleep, typedAs } from '@votingworks/basics';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import type { MachineRecord } from '@votingworks/admin-backend';
import userEvent from '@testing-library/user-event';
import { act, screen, within } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { AdjudicationStartScreen } from './adjudication_start_screen';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { mockCastVoteRecordFileRecord } from '../../test/api_mock_data';
import { MachineStatus } from '../types';

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

vi.setConfig({
  testTimeout: 20000,
});

const electionDefinition =
  electionTwoPartyPrimaryFixtures.readElectionDefinition();

let apiMock: ApiMock;

afterEach(async () => {
  apiMock.assertComplete();
  featureFlagMock.resetFeatureFlags();

  await act(async () => {
    await sleep(1);
  });
});

beforeEach(() => {
  apiMock = createApiMock();
});

test('No CVRs loaded', async () => {
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    pendingTally: 0,
    totalTally: 0,
  });
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<AdjudicationStartScreen />, {
    electionDefinition,
    apiMock,
  });
  await screen.findByText('Load CVRs to begin adjudication.');
});

test('No ballots flagged for adjudication', async () => {
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    pendingTally: 0,
    totalTally: 0,
  });
  apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
  renderInAppContext(<AdjudicationStartScreen />, {
    electionDefinition,
    apiMock,
  });
  await screen.findByText('No ballots flagged for adjudication.');
});

test('When tally results already marked as official, shows disabled message', async () => {
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    pendingTally: 3,
    totalTally: 5,
  });
  apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
  renderInAppContext(<AdjudicationStartScreen />, {
    electionDefinition,
    isOfficialResults: true,
    apiMock,
  });

  await screen.findByText(/Adjudication is disabled/);
});

test('When ballots need adjudication, shows start button with counts', async () => {
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    pendingTally: 3,
    totalTally: 5,
  });
  apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
  renderInAppContext(<AdjudicationStartScreen />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Start Adjudication');
  screen.getByText('3 Ballots Awaiting Review');
  screen.getByText('2 Ballots Completed');
});

describe('multi-station adjudication', () => {
  beforeEach(() => {
    featureFlagMock.enableFeatureFlag(
      BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
    );
  });

  test('shows toggle button and network section when enabled', async () => {
    apiMock.expectGetBallotAdjudicationQueueMetadata({
      pendingTally: 3,
      totalTally: 5,
    });
    apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
    apiMock.expectGetNetworkStatus();
    apiMock.expectGetIsClientAdjudicationEnabled(false);
    renderInAppContext(<AdjudicationStartScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText('Start Adjudication');
    screen.getByRole('button', {
      name: 'Enable Multi-Station Adjudication',
    });
    screen.getByText('Network: Online');
    screen.getByText('No clients have connected.');
  });

  test('shows disable button when adjudication is enabled', async () => {
    apiMock.expectGetBallotAdjudicationQueueMetadata({
      pendingTally: 3,
      totalTally: 5,
    });
    apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
    apiMock.expectGetNetworkStatus();
    apiMock.expectGetIsClientAdjudicationEnabled(true);
    renderInAppContext(<AdjudicationStartScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByRole('button', {
      name: 'Disable Multi-Station Adjudication',
    });
  });

  test('toggles adjudication enabled state', async () => {
    apiMock.expectGetBallotAdjudicationQueueMetadata({
      pendingTally: 3,
      totalTally: 5,
    });
    apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
    apiMock.expectGetNetworkStatus();
    apiMock.expectGetIsClientAdjudicationEnabled(false);
    renderInAppContext(<AdjudicationStartScreen />, {
      electionDefinition,
      apiMock,
    });

    const enableButton = await screen.findByRole('button', {
      name: 'Enable Multi-Station Adjudication',
    });
    apiMock.apiClient.setIsClientAdjudicationEnabled
      .expectCallWith({ enabled: true })
      .resolves();
    userEvent.click(enableButton);
  });

  test('shows network offline status', async () => {
    apiMock.expectGetBallotAdjudicationQueueMetadata({
      pendingTally: 3,
      totalTally: 5,
    });
    apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
    apiMock.expectGetNetworkStatus({ isOnline: false });
    apiMock.expectGetIsClientAdjudicationEnabled(false);
    renderInAppContext(<AdjudicationStartScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText('Network: Offline');
  });

  test('shows connected clients table with status', async () => {
    const connectedClients: MachineRecord[] = [
      typedAs<MachineRecord>({
        machineId: 'CLIENT-001',
        machineMode: 'client',
        status: MachineStatus.Active,
        authType: 'election_manager',
        lastSeenAt: Date.now(),
      }),
      typedAs<MachineRecord>({
        machineId: 'CLIENT-002',
        machineMode: 'client',
        status: MachineStatus.OnlineLocked,
        authType: null,
        lastSeenAt: Date.now(),
      }),
      typedAs<MachineRecord>({
        machineId: 'CLIENT-003',
        machineMode: 'client',
        status: MachineStatus.Offline,
        authType: null,
        lastSeenAt: Date.now() - 60000,
      }),
      typedAs<MachineRecord>({
        machineId: 'CLIENT-004',
        machineMode: 'client',
        status: MachineStatus.Adjudicating,
        authType: 'election_manager',
        lastSeenAt: Date.now(),
      }),
    ];
    apiMock.expectGetBallotAdjudicationQueueMetadata({
      pendingTally: 3,
      totalTally: 5,
    });
    apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
    apiMock.expectGetNetworkStatus({ connectedClients });
    apiMock.expectGetIsClientAdjudicationEnabled(false);
    renderInAppContext(<AdjudicationStartScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText('CLIENT-001');
    const rows = screen.getAllByRole('row');
    // header + 4 clients = 5 rows
    expect(rows).toHaveLength(5);

    const row1 = rows[1];
    within(row1).getByText('CLIENT-001');
    within(row1).getByText('Active');
    within(row1).getByText('Election Manager');

    const row2 = rows[2];
    within(row2).getByText('CLIENT-002');
    within(row2).getByText('Locked');

    const row3 = rows[3];
    within(row3).getByText('CLIENT-003');
    within(row3).getByText('Disconnected');

    const row4 = rows[4];
    within(row4).getByText('CLIENT-004');
    within(row4).getByText('Adjudicating');
  });

  test('shows network section on callout screens', async () => {
    apiMock.expectGetBallotAdjudicationQueueMetadata({
      pendingTally: 0,
      totalTally: 0,
    });
    apiMock.expectGetCastVoteRecordFiles([]);
    apiMock.expectGetNetworkStatus();
    renderInAppContext(<AdjudicationStartScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText('Load CVRs to begin adjudication.');
    screen.getByText('Network: Online');
  });
});
