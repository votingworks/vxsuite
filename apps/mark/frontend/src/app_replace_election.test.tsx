import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  electionTwoPartyPrimaryDefinition,
  electionGeneralDefinition,
} from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { screen } from '../test/react_testing_library';
import { render } from '../test/test_utils';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(2000);

test('app renders a notice when election hash on card does not match that of machine config', async () => {
  apiMock.expectGetMachineConfig();
  // Set up an already-configured election
  apiMock.expectGetSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);

  // setup with typical election
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  // insert election manager card with different election
  apiMock.setAuthStatusElectionManagerLoggedIn(
    electionTwoPartyPrimaryDefinition
  );
  await screen.findByText('This card is configured for a different election.');
});
