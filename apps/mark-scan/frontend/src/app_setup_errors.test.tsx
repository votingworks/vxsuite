import { MemoryHardware, ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import {
  BATTERY_POLLING_INTERVAL,
  LOW_BATTERY_THRESHOLD,
} from '@votingworks/ui';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import {
  act,
  render,
  screen,
  waitForElementToBeRemoved,
} from '../test/react_testing_library';

import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { withMarkup } from '../test/helpers/with_markup';
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

const insertCardScreenText = 'Insert Card';
const lowBatteryErrorScreenText = 'No Power Detected and Battery is Low';
const noPowerDetectedWarningText = 'No Power Detected.';

describe('Displays setup warning messages and errors screens', () => {
  it('Displays error screen if Card Reader connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    const hardware = MemoryHardware.buildStandard();
    apiMock.expectGetElectionDefinition(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(
      <App
        hardware={hardware}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );

    // Start on Insert Card screen
    await screen.findByText(insertCardScreenText);

    // Disconnect Card Reader
    apiMock.setAuthStatusLoggedOut('no_card_reader');
    await advanceTimersAndPromises();
    screen.getByText('Card Reader Not Detected');

    // Reconnect Card Reader
    apiMock.setAuthStatusLoggedOut();
    await advanceTimersAndPromises();
    screen.getByText(insertCardScreenText);
  });

  it('Displays error screen if Power connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    const hardware = MemoryHardware.buildStandard();
    apiMock.expectGetElectionDefinition(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(
      <App
        hardware={hardware}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );

    await screen.findByText('Insert Card');

    // Disconnect Power
    act(() => {
      hardware.setBatteryDischarging(true);
    });
    await screen.findByText(noPowerDetectedWarningText);

    // Reconnect Power
    act(() => {
      hardware.setBatteryDischarging(false);
    });
    await waitForElementToBeRemoved(
      screen.queryByText(noPowerDetectedWarningText)
    );
  });

  it('Displays "discharging battery" warning message and "discharging battery + low battery" error screen', async () => {
    apiMock.expectGetMachineConfig();
    const hardware = MemoryHardware.buildStandard();
    apiMock.expectGetElectionDefinition(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(
      <App
        hardware={hardware}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );
    const findByTextWithMarkup = withMarkup(screen.findByText);

    // Start on Insert Card screen
    await screen.findByText(insertCardScreenText);

    // Remove charger and reduce battery level slightly
    act(() => {
      hardware.setBatteryDischarging(true);
      hardware.setBatteryLevel(0.6);
    });
    await screen.findByText(noPowerDetectedWarningText);
    screen.getByText(insertCardScreenText);

    // Battery level drains below low threshold
    act(() => {
      hardware.setBatteryLevel(LOW_BATTERY_THRESHOLD / 2);
    });
    await findByTextWithMarkup(lowBatteryErrorScreenText);

    // Attach charger and back on Insert Card screen
    act(() => {
      hardware.setBatteryDischarging(false);
    });
    await screen.findByText(insertCardScreenText);
    expect(screen.queryByText(noPowerDetectedWarningText)).toBeFalsy();

    // Unplug charger and show warning again
    act(() => {
      hardware.setBatteryDischarging(true);
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL / 1000);
    await findByTextWithMarkup(lowBatteryErrorScreenText);

    // Remove battery, i.e. we're on a desktop
    act(() => {
      hardware.removeBattery();
    });
    await screen.findByText(insertCardScreenText);
    expect(screen.queryByText(noPowerDetectedWarningText)).toBeFalsy();
  });

  it('displays paper handler connection error if no paper handler', async () => {
    apiMock.setPaperHandlerState('no_hardware');
    apiMock.expectGetMachineConfig();
    const hardware = MemoryHardware.buildStandard();
    apiMock.expectGetElectionDefinition(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(
      <App
        hardware={hardware}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );

    await screen.findByText('No Connection to Printer-Scanner');
  });
});
