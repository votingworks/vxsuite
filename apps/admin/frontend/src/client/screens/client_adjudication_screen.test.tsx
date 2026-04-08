import { afterEach, beforeEach, expect, test } from 'vitest';
import {
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, constructElectionKey } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { err, ok } from '@votingworks/basics';
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

test('shows enabled start button when adjudication is enabled', async () => {
  apiMock.expectGetAdjudicationSessionStatus(true);
  renderAdjudicationScreen(pollWorkerAuth, { withElection: true });
  await screen.findByRole('heading', { name: 'Adjudication' });
  const startButton = screen.getByRole('button', {
    name: 'Start Adjudication',
  });
  expect(startButton).not.toBeDisabled();
});

test('shows waiting message and disabled button when adjudication not enabled', async () => {
  apiMock.expectGetAdjudicationSessionStatus(false);
  renderAdjudicationScreen(pollWorkerAuth, { withElection: true });
  await screen.findByText('Waiting for host to initiate adjudication.');
  const startButton = screen.getByRole('button', {
    name: 'Start Adjudication',
  });
  expect(startButton).toBeDisabled();
});

test('start adjudication claims a ballot and navigates', async () => {
  apiMock.expectGetAdjudicationSessionStatus(true);
  apiMock.apiClient.claimBallot.expectCallWith({}).resolves(ok('cvr-1'));

  renderAdjudicationScreen(pollWorkerAuth, { withElection: true });
  const startButton = await screen.findByRole('button', {
    name: 'Start Adjudication',
  });
  startButton.click();

  await screen.findByText('Claiming ballot…');
});

test('start adjudication shows error on host disconnect', async () => {
  apiMock.expectGetAdjudicationSessionStatus(true);
  apiMock.apiClient.claimBallot
    .expectCallWith({})
    .resolves(err({ type: 'host-disconnect' }));

  renderAdjudicationScreen(pollWorkerAuth, { withElection: true });
  const startButton = await screen.findByRole('button', {
    name: 'Start Adjudication',
  });
  startButton.click();

  await screen.findByText('Disconnected from host.');
  expect(
    screen.getByRole('button', { name: 'Start Adjudication' })
  ).not.toBeDisabled();
});

test('start adjudication resets when no ballots available', async () => {
  apiMock.expectGetAdjudicationSessionStatus(true);
  apiMock.apiClient.claimBallot.expectCallWith({}).resolves(ok(undefined));

  renderAdjudicationScreen(pollWorkerAuth, { withElection: true });
  const startButton = await screen.findByRole('button', {
    name: 'Start Adjudication',
  });
  startButton.click();

  // Button should re-enable and message should appear
  await screen.findByRole('button', { name: 'Start Adjudication' });
  screen.getByText('No ballots available for adjudication.');
});
