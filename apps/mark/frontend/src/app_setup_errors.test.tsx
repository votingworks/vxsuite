import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { act, render, screen } from '../test/react_testing_library';

import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { ACCESSIBLE_CONTROLLER_POLLING_INTERVAL_MS } from './api';

const electionGeneralDefinition = readElectionGeneralDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

const insertCardScreenText = 'Insert Card';

describe('Displays setup warning messages and errors screens', () => {
  test('Displays warning if Accessible Controller connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);
    const accessibleControllerWarningText =
      'Voting with an accessible controller is not currently available.';

    // Start on Insert Card screen
    await screen.findByText(insertCardScreenText);
    expect(screen.queryByText(accessibleControllerWarningText)).toBeFalsy();

    // Disconnect Accessible Controller
    act(() => {
      apiMock.setAccessibleControllerConnected(false);
    });
    await advanceTimersAndPromises(
      ACCESSIBLE_CONTROLLER_POLLING_INTERVAL_MS / 1000
    );
    await vi.waitFor(() => {
      screen.getByText(accessibleControllerWarningText);
      screen.getByText(insertCardScreenText);
    });

    // Reconnect Accessible Controller
    act(() => {
      apiMock.setAccessibleControllerConnected(true);
    });
    await advanceTimersAndPromises(
      ACCESSIBLE_CONTROLLER_POLLING_INTERVAL_MS / 1000
    );
    await vi.waitFor(() => {
      expect(screen.queryByText(accessibleControllerWarningText)).toBeFalsy();
      screen.getByText(insertCardScreenText);
    });
  });

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
    await advanceTimersAndPromises();
    await screen.findByText('Card Reader Not Detected');

    // Reconnect Card Reader
    apiMock.setAuthStatusLoggedOut();
    await advanceTimersAndPromises();
    await screen.findByText(insertCardScreenText);
  });

  test('Admin screen trumps "Printer Disconnected" error', async () => {
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);

    await screen.findByText('Insert Card');

    // Disconnect Printer
    act(() => {
      apiMock.setPrinterStatus({ connected: false });
    });
    await advanceTimersAndPromises();
    // When polls are open, the alarm screen is shown with internationalized text
    await screen.findByText('Internal Connection Problem');

    // Insert election manager card
    apiMock.setAuthStatusElectionManagerLoggedIn(electionGeneralDefinition);

    // expect to see election manager screen
    await screen.findByRole('heading', { name: 'Election Manager Menu' });
  });
});
