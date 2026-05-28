import { afterEach, beforeEach, expect, test } from 'vitest';
import {
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, constructElectionKey } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { screen } from '../../../test/react_testing_library';
import {
  ClientApiMock,
  createClientApiMock,
} from '../../../test/helpers/mock_client_api_client';
import { renderInClientContext } from '../../../test/render_in_client_context';
import { routerPaths } from '../../router_paths';
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
  await screen.findByText('Waiting for VxAdmin to initiate adjudication.');
  const startButton = screen.getByRole('button', {
    name: 'Start Adjudication',
  });
  expect(startButton).toBeDisabled();
});

test('start adjudication navigates to the ballot screen', async () => {
  apiMock.expectGetAdjudicationSessionStatus(true);

  renderAdjudicationScreen(pollWorkerAuth, { withElection: true });
  const startButton = await screen.findByRole('button', {
    name: 'Start Adjudication',
  });
  startButton.click();

  expect(window.location.pathname).toEqual(routerPaths.ballotAdjudication);
  await screen.findByText('Claiming ballot…');
});
