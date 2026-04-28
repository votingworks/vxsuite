import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { sleep, typedAs } from '@votingworks/basics';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import type {
  MachineRecord,
  QualifiedWriteInCandidateRecord,
} from '@votingworks/admin-backend';
import userEvent from '@testing-library/user-event';
import { Admin, DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { act, screen, within } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { AdjudicationStartScreen } from './adjudication_start_screen';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { mockCastVoteRecordFileRecord } from '../../test/api_mock_data';

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
  apiMock.expectGetSystemSettings();
  apiMock.apiClient.getQualifiedWriteInCandidates
    .expectRepeatedCallsWith()
    .resolves([]);
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

test('When tally results already marked as official, adjudication buttons are disabled and multi-station card is hidden', async () => {
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    areWriteInCandidatesQualified: true,
  });
  apiMock.apiClient.getQualifiedWriteInCandidates
    .expectRepeatedCallsWith()
    .resolves([]);
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    pendingTally: 3,
    totalTally: 5,
  });
  apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );
  apiMock.expectGetNetworkStatus();
  renderInAppContext(<AdjudicationStartScreen />, {
    electionDefinition,
    isOfficialResults: true,
    apiMock,
  });

  expect(
    await screen.findByRole('button', { name: 'Adjudicate' })
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add Candidates' })).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Enable Multi-Station' })
  ).not.toBeInTheDocument();
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

  await screen.findByRole('button', { name: 'Adjudicate' });
  screen.getByText('3 ballots remaining');
  screen.getByText('2 of 5 adjudicated · 40%');
});

describe('multi-station adjudication', () => {
  beforeEach(() => {
    featureFlagMock.enableFeatureFlag(
      BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
    );
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
      name: 'Enable Multi-Station',
    });
    apiMock.apiClient.setIsClientAdjudicationEnabled
      .expectCallWith({ enabled: true })
      .resolves();
    apiMock.expectGetIsClientAdjudicationEnabled(true);
    userEvent.click(enableButton);

    await screen.findByRole('button', { name: 'Disable' });
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

    await screen.findByRole('heading', { name: 'Multi-Station Adjudication' });
    expect(
      screen.queryByRole('button', { name: 'Enable Multi-Station' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('shows connected clients table with status', async () => {
    const connectedClients: MachineRecord[] = [
      typedAs<MachineRecord>({
        machineId: 'CLIENT-001',
        machineMode: 'client',
        status: Admin.ClientMachineStatus.Active,
        authType: 'election_manager',
        lastSeenAt: Date.now(),
      }),
      typedAs<MachineRecord>({
        machineId: 'CLIENT-002',
        machineMode: 'client',
        status: Admin.ClientMachineStatus.OnlineLocked,
        authType: null,
        lastSeenAt: Date.now(),
      }),
      typedAs<MachineRecord>({
        machineId: 'CLIENT-003',
        machineMode: 'client',
        status: Admin.ClientMachineStatus.Offline,
        authType: null,
        lastSeenAt: Date.now() - 60000,
      }),
      typedAs<MachineRecord>({
        machineId: 'CLIENT-004',
        machineMode: 'client',
        status: Admin.ClientMachineStatus.Adjudicating,
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
    apiMock.expectGetIsClientAdjudicationEnabled(false);
    renderInAppContext(<AdjudicationStartScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText('Load CVRs to begin adjudication.');
    screen.getByRole('heading', { name: 'Multi-Station Adjudication' });
  });

  test('shows online status when enabled with no real clients', async () => {
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

    await screen.findByText('Online · Clients Can Adjudicate Ballots');
    screen.getByRole('table');
  });

  test('always shows the clients table even when disabled', async () => {
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

    await screen.findByRole('button', { name: 'Enable Multi-Station' });
    screen.getByText('Off · Clients Cannot Adjudicate Ballots');
    screen.getByRole('table');
  });
});

test('shows completed state when all ballots adjudicated', async () => {
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    pendingTally: 0,
    totalTally: 5,
  });
  apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
  renderInAppContext(<AdjudicationStartScreen />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('All ballots adjudicated');
  screen.getByRole('button', { name: 'Review' });
});

describe('qualified write-in candidates card', () => {
  beforeEach(() => {
    apiMock = createApiMock();
    apiMock.expectGetSystemSettings({
      ...DEFAULT_SYSTEM_SETTINGS,
      areWriteInCandidatesQualified: true,
    });
  });

  function expectGetQualifiedWriteInCandidates(
    candidates: QualifiedWriteInCandidateRecord[]
  ) {
    apiMock.apiClient.getQualifiedWriteInCandidates
      .expectRepeatedCallsWith()
      .resolves(candidates);
  }

  test('shows empty state when no candidates have been added', async () => {
    apiMock.expectGetBallotAdjudicationQueueMetadata({
      pendingTally: 3,
      totalTally: 5,
    });
    apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
    expectGetQualifiedWriteInCandidates([]);
    renderInAppContext(<AdjudicationStartScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(/Add qualified write-in candidates/);
    screen.getByRole('button', { name: 'Add Candidates' });
  });

  test('shows partial state when some contests still need candidates', async () => {
    apiMock.expectGetBallotAdjudicationQueueMetadata({
      pendingTally: 3,
      totalTally: 5,
    });
    apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
    expectGetQualifiedWriteInCandidates([
      {
        id: 'c1',
        electionId: 'e1',
        contestId: 'zoo-council-mammal',
        name: 'Aardvark',
        hasAdjudicatedVotes: false,
      },
    ]);
    renderInAppContext(<AdjudicationStartScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(
      /1 of 2 write-in contests have qualified candidates/
    );
    screen.getByRole('button', { name: 'Edit Candidates' });
  });

  test('shows completed state when every write-in contest has candidates', async () => {
    apiMock.expectGetBallotAdjudicationQueueMetadata({
      pendingTally: 3,
      totalTally: 5,
    });
    apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
    expectGetQualifiedWriteInCandidates([
      {
        id: 'c1',
        electionId: 'e1',
        contestId: 'zoo-council-mammal',
        name: 'Aardvark',
        hasAdjudicatedVotes: false,
      },
      {
        id: 'c2',
        electionId: 'e1',
        contestId: 'aquarium-council-fish',
        name: 'Barracuda',
        hasAdjudicatedVotes: false,
      },
    ]);
    renderInAppContext(<AdjudicationStartScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(
      /2 of 2 write-in contests have qualified candidates/
    );
    screen.getByRole('button', { name: 'Edit Candidates' });
  });
});
