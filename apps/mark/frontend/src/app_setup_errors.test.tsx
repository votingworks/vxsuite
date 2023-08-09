import { MemoryStorage, MemoryHardware } from '@votingworks/utils';

import { LOW_BATTERY_THRESHOLD } from '@votingworks/ui';
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  act,
  render,
  screen,
  waitForElementToBeRemoved,
} from '../test/react_testing_library';

import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import {
  electionDefinition,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { withMarkup } from '../test/helpers/with_markup';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

const insertCardScreenText = 'Insert Card';
const lowBatteryErrorScreenText = 'No Power Detected and Battery is Low';
const noPowerDetectedWarningText = 'No Power Detected.';

describe('Displays setup warning messages and errors screens', () => {
  it('Displays warning if Accessible Controller connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    const storage = new MemoryStorage();
    const hardware = MemoryHardware.buildStandard();
    hardware.setAccessibleControllerConnected(true);

    await setElectionInStorage(storage);
    await setStateInStorage(storage);

    render(
      <App
        hardware={hardware}
        storage={storage}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );
    const accessibleControllerWarningText =
      'Voting with an accessible controller is not currently available.';

    // Start on Insert Card screen
    await screen.findByText(insertCardScreenText);
    expect(screen.queryByText(accessibleControllerWarningText)).toBeFalsy();

    // Disconnect Accessible Controller
    act(() => {
      hardware.setAccessibleControllerConnected(false);
    });
    await advanceTimersAndPromises();
    screen.getByText(accessibleControllerWarningText);
    screen.getByText(insertCardScreenText);

    // Reconnect Accessible Controller
    act(() => {
      hardware.setAccessibleControllerConnected(true);
    });
    await advanceTimersAndPromises();
    expect(screen.queryByText(accessibleControllerWarningText)).toBeFalsy();
    screen.getByText(insertCardScreenText);
  });

  it('Displays error screen if Card Reader connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    const storage = new MemoryStorage();
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage);
    await setStateInStorage(storage);

    render(
      <App
        hardware={hardware}
        storage={storage}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );

    // Start on Insert Card screen
    await screen.findByText(insertCardScreenText);

    // Disconnect Card Reader
    act(() => {
      hardware.setCardReaderConnected(false);
    });
    await advanceTimersAndPromises();
    screen.getByText('Card Reader Not Detected');

    // Reconnect Card Reader
    act(() => {
      hardware.setCardReaderConnected(true);
    });
    await advanceTimersAndPromises();
    screen.getByText(insertCardScreenText);
  });

  it('Displays error screen if Power connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    const storage = new MemoryStorage();
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage);
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

  it('Admin screen trumps "No Printer Detected" error', async () => {
    apiMock.expectGetMachineConfig();
    const storage = new MemoryStorage();
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage, electionDefinition);
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

    // Disconnect Printer
    act(() => {
      hardware.setPrinterConnected(false);
    });
    await advanceTimersAndPromises();
    screen.getByText('No Printer Detected');

    // Insert election manager card
    apiMock.setAuthStatusElectionManagerLoggedIn(electionSampleDefinition);

    // expect to see election manager screen
    await screen.findByText('Election Manager Actions');
  });

  it('Displays "discharging battery" warning message and "discharging battery + low battery" error screen', async () => {
    apiMock.expectGetMachineConfig();
    const storage = new MemoryStorage();
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage);
    await setStateInStorage(storage);
    render(
      <App
        hardware={hardware}
        storage={storage}
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
    await findByTextWithMarkup(lowBatteryErrorScreenText);

    // Remove battery, i.e. we're on a desktop
    act(() => {
      hardware.removeBattery();
    });
    await screen.findByText(insertCardScreenText);
    expect(screen.queryByText(noPowerDetectedWarningText)).toBeFalsy();
  });
});
