import { afterEach, beforeEach, expect, test } from 'vitest';
import {
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, constructElectionKey } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { screen } from '../../../test/react_testing_library';
import {
  ClientApiMock,
  createClientApiMock,
} from '../../../test/helpers/mock_client_api_client';
import { renderInClientContext } from '../../../test/render_in_client_context';
import { ClientAdjudicationScreen } from './client_adjudication_screen';

let apiMock: ClientApiMock;

const electionDefinition = readElectionGeneralDefinition();

beforeEach(() => {
  apiMock = createClientApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

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
  apiMock.expectGetNetworkConnectionStatus('online-connected-to-host', '0001');
  apiMock.expectGetAdjudicationSessionStatus(true);
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
  apiMock.expectGetNetworkConnectionStatus('online-connected-to-host', '0001');
  apiMock.expectGetAdjudicationSessionStatus(true);
  renderAdjudicationScreen(pollWorkerAuth);
  await screen.findByText(/Connected to host 0001/);
  const startButton = screen.getByRole('button', {
    name: 'Start Adjudication',
  });
  expect(startButton).toBeDisabled();
});

test('shows waiting for host message when adjudication not enabled', async () => {
  apiMock.expectGetNetworkConnectionStatus('online-connected-to-host', '0001');
  apiMock.expectGetAdjudicationSessionStatus(false);
  renderAdjudicationScreen(pollWorkerAuth, { withElection: true });
  await screen.findByText('Waiting for host to initiate adjudication.');
  const startButton = screen.getByRole('button', {
    name: 'Start Adjudication',
  });
  expect(startButton).toBeDisabled();
});

test('shows offline status with disabled start button', async () => {
  apiMock.expectGetNetworkConnectionStatus('offline');
  apiMock.expectGetAdjudicationSessionStatus();
  renderAdjudicationScreen(pollWorkerAuth);
  await screen.findByRole('heading', { name: 'Adjudication' });
  await screen.findByText(/Offline/);
  await screen.findByText(
    /Connect to a host with an election configured to begin adjudication/
  );
});

test('shows searching for host status', async () => {
  apiMock.expectGetNetworkConnectionStatus('online-waiting-for-host');
  apiMock.expectGetAdjudicationSessionStatus();
  renderAdjudicationScreen(sysAdminAuth);
  await screen.findByText(/Searching for host/);
});
