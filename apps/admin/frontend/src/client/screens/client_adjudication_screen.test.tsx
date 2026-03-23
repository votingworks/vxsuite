import { afterEach, beforeEach, expect, test } from 'vitest';
import {
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, constructElectionKey } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { screen } from '../../../test/react_testing_library';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInClientContext } from '../../../test/render_in_client_context';
import { ClientAdjudicationScreen } from './client_adjudication_screen';

let apiMock: ApiMock;

const electionDefinition = readElectionGeneralDefinition();

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

function expectNetworkStatus(
  status: 'offline' | 'online-waiting-for-host' | 'online-connected-to-host',
  hostMachineId?: string
) {
  const value =
    status === 'online-connected-to-host'
      ? { status, hostMachineId: hostMachineId ?? '0001' }
      : { status };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (apiMock.apiClient as any).getNetworkConnectionStatus
    .expectRepeatedCallsWith()
    .resolves(value);
}

const pollWorkerAuth: DippedSmartCardAuth.PollWorkerLoggedIn = {
  status: 'logged_in',
  user: mockPollWorkerUser({
    electionKey: constructElectionKey(electionDefinition.election),
  }),
  sessionExpiresAt: mockSessionExpiresAt(),
};

const sysAdminAuth: DippedSmartCardAuth.SystemAdministratorLoggedIn = {
  status: 'logged_in',
  user: mockSystemAdministratorUser(),
  sessionExpiresAt: mockSessionExpiresAt(),
  programmableCard: { status: 'no_card' },
};

function renderAdjudicationScreen(
  auth: DippedSmartCardAuth.AuthStatus,
  { withElection = false }: { withElection?: boolean } = {}
) {
  return renderInClientContext(<ClientAdjudicationScreen />, {
    auth,
    apiMock,
    ...(withElection ? { electionDefinition } : {}),
  });
}

test('shows connected status with election info and enabled start button', async () => {
  expectNetworkStatus('online-connected-to-host', '0001');
  renderAdjudicationScreen(pollWorkerAuth, { withElection: true });
  await screen.findByRole('heading', { name: 'Adjudication' });
  await screen.findByText(/Connected to host 0001/);
  screen.getByRole('heading', { name: 'Election' });
  expect(
    screen.getAllByText(new RegExp(electionDefinition.election.county.name))
      .length
  ).toBeGreaterThanOrEqual(1);
  const startButton = screen.getByRole('button', {
    name: 'Start Adjudication',
  });
  expect(startButton).not.toBeDisabled();
});

test('disables start button when connected but no election', async () => {
  expectNetworkStatus('online-connected-to-host', '0001');
  renderAdjudicationScreen(pollWorkerAuth);
  await screen.findByText(/Connected to host 0001/);
  const startButton = screen.getByRole('button', {
    name: 'Start Adjudication',
  });
  expect(startButton).toBeDisabled();
});

test('shows offline status with disabled start button', async () => {
  expectNetworkStatus('offline');
  renderAdjudicationScreen(pollWorkerAuth);
  await screen.findByRole('heading', { name: 'Adjudication' });
  await screen.findByText(/Offline/);
  await screen.findByText(
    /Connect to a host with an election configured to begin adjudication/
  );
});

test('shows searching for host status', async () => {
  expectNetworkStatus('online-waiting-for-host');
  renderAdjudicationScreen(sysAdminAuth);
  await screen.findByText(/Searching for host/);
});
