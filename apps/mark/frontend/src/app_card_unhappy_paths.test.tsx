import { MemoryStorage, MemoryHardware } from '@votingworks/utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { render, screen } from '../test/react_testing_library';

import { App } from './app';

import { setStateInStorage } from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Shows card backwards screen when card connection error occurs', async () => {
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  apiMock.expectGetElectionDefinition(electionGeneralDefinition);
  await setStateInStorage(storage);

  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );
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
