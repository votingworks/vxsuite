import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { render, screen } from '../test/react_testing_library';

import { App } from './app';

import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Shows card backwards screen when card connection error occurs', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);
  await screen.findByText('Insert Card');

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'card_error',
  });
  await screen.findByText('Card is Backwards');
  screen.getByText('Remove the card, turn it around, and insert it again.');

  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
});
