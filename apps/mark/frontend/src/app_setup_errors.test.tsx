import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { BATTERY_POLLING_INTERVAL_GROUT } from '@votingworks/ui';
import { act, render, screen } from '../test/react_testing_library';

import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { withMarkup } from '../test/helpers/with_markup';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { ACCESSIBLE_CONTROLLER_POLLING_INTERVAL_MS } from './api';
import { LOW_BATTERY_THRESHOLD } from './config/globals';

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
const lowBatteryErrorScreenText = 'No Power Detected and Battery is Low';
const noPowerDetectedWarningText = 'No Power Detected.';

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

  test('Displays error screen if Power connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);

    await screen.findByText('Insert Card');

    // Disconnect Power
    act(() => {
      apiMock.setBatteryInfo({ discharging: true, level: 1 });
    });
    await advanceTimersAndPromises(2);
    await screen.findByText(noPowerDetectedWarningText);

    // Reconnect Power
    act(() => {
      apiMock.setBatteryInfo({ discharging: false, level: 1 });
    });
    await advanceTimersAndPromises(2);
    await vi.waitFor(() => {
      expect(
        screen.queryByText(noPowerDetectedWarningText)
      ).not.toBeInTheDocument();
    });
  });

  test('Admin screen trumps "No Printer Detected" error', async () => {
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
    await screen.findByText('No Printer Detected');

    // Insert election manager card
    apiMock.setAuthStatusElectionManagerLoggedIn(electionGeneralDefinition);

    // expect to see election manager screen
    await screen.findByRole('heading', { name: 'Election Manager Settings' });
  });

  test('Displays "discharging battery" warning message and "discharging battery + low battery" error screen', async () => {
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);
    const findByTextWithMarkup = withMarkup(screen.findByText);

    // Start on Insert Card screen
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL_GROUT);
    await screen.findByText(insertCardScreenText);

    // Remove charger and reduce battery level slightly
    act(() => {
      apiMock.setBatteryInfo({
        discharging: true,
        level: 0.6,
      });
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL_GROUT);
    await screen.findByText(noPowerDetectedWarningText);
    screen.getByText(insertCardScreenText);

    // Battery level drains below low threshold
    act(() => {
      apiMock.setBatteryInfo({
        discharging: true,
        level: LOW_BATTERY_THRESHOLD / 2,
      });
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL_GROUT);
    await findByTextWithMarkup(lowBatteryErrorScreenText);

    // Attach charger and back on Insert Card screen
    act(() => {
      apiMock.setBatteryInfo({
        discharging: false,
        level: LOW_BATTERY_THRESHOLD / 2,
      });
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL_GROUT);
    await screen.findByText(insertCardScreenText);
    expect(screen.queryByText(noPowerDetectedWarningText)).toBeFalsy();

    // Unplug charger and show warning again
    act(() => {
      apiMock.setBatteryInfo({
        discharging: true,
        level: LOW_BATTERY_THRESHOLD / 2,
      });
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL_GROUT);
    await findByTextWithMarkup(lowBatteryErrorScreenText);

    // Remove battery, i.e. we're on a desktop
    act(() => {
      apiMock.setBatteryInfo();
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL_GROUT);
    await screen.findByText(insertCardScreenText);
    expect(screen.queryByText(noPowerDetectedWarningText)).toBeFalsy();
  });
});
