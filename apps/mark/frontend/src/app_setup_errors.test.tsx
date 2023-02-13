import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { makeElectionManagerCard } from '@votingworks/test-utils';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import {
  BATTERY_POLLING_INTERVAL,
  LOW_BATTERY_THRESHOLD,
} from '@votingworks/shared-frontend';
import { electionSampleDefinition } from '@votingworks/fixtures';

import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/smartcards';

import {
  electionDefinition,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { withMarkup } from '../test/helpers/with_markup';
import { enterPin } from '../test/test_utils';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
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
    const card = new MemoryCard();
    const storage = new MemoryStorage();
    const hardware = MemoryHardware.buildStandard();
    hardware.setAccessibleControllerConnected(true);

    await setElectionInStorage(storage);
    await setStateInStorage(storage);

    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );
    const accessibleControllerWarningText =
      'Voting with an accessible controller is not currently available.';

    // Let the initial hardware detection run.
    await advanceTimersAndPromises();
    await advanceTimersAndPromises();

    // Start on Insert Card screen
    screen.getByText(insertCardScreenText);
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
    const card = new MemoryCard();
    const storage = new MemoryStorage();
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage);
    await setStateInStorage(storage);

    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );

    // Let the initial hardware detection run.
    await advanceTimersAndPromises();

    // Start on Insert Card screen
    screen.getByText(insertCardScreenText);

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
    const card = new MemoryCard();
    const storage = new MemoryStorage();
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage);
    await setStateInStorage(storage);
    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );

    // Let the initial hardware detection run.
    await advanceTimersAndPromises();
    screen.getByText('Insert Card');

    // Disconnect Power
    act(() => {
      hardware.setBatteryDischarging(true);
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL / 1000);
    screen.getByText(noPowerDetectedWarningText);

    // Reconnect Power
    act(() => {
      hardware.setBatteryDischarging(false);
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL / 1000);
    expect(screen.queryByText(noPowerDetectedWarningText)).toBeFalsy();
  });

  it('Admin screen trumps "No Printer Detected" error', async () => {
    apiMock.expectGetMachineConfig();
    const card = new MemoryCard();
    const electionManagerCard = makeElectionManagerCard(
      electionDefinition.electionHash
    );
    const storage = new MemoryStorage();
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage, electionDefinition);
    await setStateInStorage(storage);
    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );

    await advanceTimersAndPromises();
    screen.getByText('Insert Card');

    // Disconnect Printer
    act(() => {
      hardware.setPrinterConnected(false);
    });
    await advanceTimersAndPromises();
    screen.getByText('No Printer Detected');

    // Insert election manager card
    card.insertCard(electionManagerCard, electionSampleDefinition.electionData);
    await enterPin();

    // expect to see election manager screen
    screen.getByText('Election Manager Actions');
  });

  it('Displays "discharging battery" warning message and "discharging battery + low battery" error screen', async () => {
    apiMock.expectGetMachineConfig();
    const card = new MemoryCard();
    const storage = new MemoryStorage();
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage);
    await setStateInStorage(storage);
    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );
    const getByTextWithMarkup = withMarkup(screen.getByText);

    // Let the initial hardware detection run.
    await advanceTimersAndPromises();

    // Start on Insert Card screen
    screen.getByText(insertCardScreenText);

    // Remove charger and reduce battery level slightly
    act(() => {
      hardware.setBatteryDischarging(true);
      hardware.setBatteryLevel(0.6);
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL / 1000);
    screen.getByText(noPowerDetectedWarningText);
    screen.getByText(insertCardScreenText);

    // Battery level drains below low threshold
    act(() => {
      hardware.setBatteryLevel(LOW_BATTERY_THRESHOLD / 2);
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL / 1000);
    getByTextWithMarkup(lowBatteryErrorScreenText);

    // Attach charger and back on Insert Card screen
    act(() => {
      hardware.setBatteryDischarging(false);
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL / 1000);
    expect(screen.queryByText(noPowerDetectedWarningText)).toBeFalsy();
    screen.getByText(insertCardScreenText);

    // Unplug charger and show warning again
    act(() => {
      hardware.setBatteryDischarging(true);
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL / 1000);
    getByTextWithMarkup(lowBatteryErrorScreenText);

    // Remove battery, i.e. we're on a desktop
    act(() => {
      hardware.removeBattery();
    });
    await advanceTimersAndPromises(BATTERY_POLLING_INTERVAL / 1000);
    expect(screen.queryByText(noPowerDetectedWarningText)).toBeFalsy();
    screen.getByText(insertCardScreenText);
    await advanceTimersAndPromises();
  });
});
