import { afterEach, beforeEach, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { anyPollingPlace } from '@votingworks/types';
import { render, screen } from '../test/react_testing_library';

import { App } from './app';

import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

const electionDefinition = readElectionGeneralDefinition();

test('Shows card backwards screen when card connection error occurs', async () => {
  apiMock.expectGetMachineConfig();

  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId: anyPollingPlace(electionDefinition.election).id,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('Insert Card');

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'card_error',
  });
  await screen.findByText('Card Backward');
  screen.getByText('Remove the card, turn it around, and insert it again.');

  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
});

test('Shows wrong election screen when election on card does not match that of machine config', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId: anyPollingPlace(electionDefinition.election).id,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  // insert election manager card with different election
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
  });
  await screen.findByText('Invalid Card');
  screen.getByText(
    'The inserted card is programmed for another election and cannot be used to unlock this machine. Remove the card to continue.'
  );

  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
});
