import { afterEach, beforeEach, describe, test, vi } from 'vitest';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { render, screen } from '../test/react_testing_library';

import { App } from './app';

import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

const electionGeneralDefinition = readElectionGeneralDefinition();

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

const insertCardScreenText = 'Insert Card';

describe('Displays setup warning messages and errors screens', () => {
  test('Displays error screen if Card Reader connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);

    // Start on Insert Card screen
    await screen.findByText(insertCardScreenText);

    // Disconnect Card Reader
    apiMock.setAuthStatusLoggedOut('no_card_reader');
    await screen.findByText('Card Reader Not Detected');

    // Reconnect Card Reader
    apiMock.setAuthStatusLoggedOut();
    await screen.findByText(insertCardScreenText);
  });

  test('displays paper handler connection error if no paper handler', async () => {
    apiMock.setPaperHandlerState('no_hardware');
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);

    await screen.findByText('Internal Connection Problem');

    screen.getByText('Ask a poll worker to restart the machine.');
  });
});
