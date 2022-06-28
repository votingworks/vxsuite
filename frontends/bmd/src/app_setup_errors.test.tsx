import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { makeAdminCard } from '@votingworks/test-utils';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import {
  BATTERY_POLLING_INTERVAL,
  LOW_BATTERY_THRESHOLD,
} from '@votingworks/ui';
import { electionSampleDefinition } from './data';

import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/smartcards';

import {
  electionDefinition,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { withMarkup } from '../test/helpers/with_markup';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { PrintOnly } from './config/types';
import { authenticateAdminCard } from '../test/test_utils';

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

const insertCardScreenText = 'Insert voter card to load ballot.';
const lowBatteryErrorScreenText = 'No Power Detected and Battery is Low';
const noPowerDetectedWarningText = 'No Power Detected.';

describe('Displays setup warning messages and errors screens', () => {
  it('Displays warning if Accessible Controller connection is lost', async () => {
    const card = new MemoryCard();
    const storage = new MemoryStorage();
    const machineConfig = fakeMachineConfigProvider();
    const hardware = MemoryHardware.buildStandard();
    hardware.setAccessibleControllerConnected(true);

    await setElectionInStorage(storage);
    await setStateInStorage(storage);

    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
        reload={jest.fn()}
      />
    );
    const accessibleControllerWarningText =
      'Voting with an accessible controller is not currently available.';

    // Let the initial hardware detection run.
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
    const card = new MemoryCard();
    const storage = new MemoryStorage();
    const machineConfig = fakeMachineConfigProvider();
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage);
    await setStateInStorage(storage);

    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
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

  it('Displays error screen if Printer connection is lost', async () => {
    const card = new MemoryCard();
    const storage = new MemoryStorage();
    const machineConfig = fakeMachineConfigProvider({ appMode: PrintOnly });
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage);
    await setStateInStorage(storage);
    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
        reload={jest.fn()}
      />
    );

    // Let the initial hardware detection run.
    await advanceTimersAndPromises();

    // Start on PrintOnly Insert Card screen
    const printOnlyInsertCardScreenText =
      'Insert Card to print your official ballot.';
    screen.getByText(printOnlyInsertCardScreenText);

    // Disconnect Printer
    act(() => {
      hardware.setPrinterConnected(false);
    });
    await advanceTimersAndPromises();
    screen.getByText('No Printer Detected');

    // Reconnect Printer
    act(() => {
      hardware.setPrinterConnected(true);
    });
    await advanceTimersAndPromises();
    screen.getByText(printOnlyInsertCardScreenText);
  });

  it('Displays error screen if Power connection is lost', async () => {
    const card = new MemoryCard();
    const storage = new MemoryStorage();
    const machineConfig = fakeMachineConfigProvider({ appMode: PrintOnly });
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage);
    await setStateInStorage(storage);
    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
        reload={jest.fn()}
      />
    );

    // Let the initial hardware detection run.
    await advanceTimersAndPromises();

    // Start on PrintOnly Insert Card screen
    const printOnlyInsertCardScreenText =
      'Insert Card to print your official ballot.';
    screen.getByText(printOnlyInsertCardScreenText);

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
    screen.getByText(printOnlyInsertCardScreenText);
  });

  it('Admin screen trumps "No Printer Detected" error', async () => {
    const card = new MemoryCard();
    const adminCard = makeAdminCard(electionDefinition.electionHash);
    const storage = new MemoryStorage();
    const machineConfig = fakeMachineConfigProvider({
      appMode: PrintOnly,
    });
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage, electionDefinition);
    await setStateInStorage(storage);
    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
        reload={jest.fn()}
      />
    );

    await advanceTimersAndPromises();

    // no printer
    // Start on PrintOnly Insert Card screen
    const printOnlyInsertCardScreenText =
      'Insert Card to print your official ballot.';
    screen.getByText(printOnlyInsertCardScreenText);

    // Disconnect Printer
    act(() => {
      hardware.setPrinterConnected(false);
    });
    await advanceTimersAndPromises();
    screen.getByText('No Printer Detected');

    // Insert admin card
    card.insertCard(adminCard, electionSampleDefinition.electionData);
    await authenticateAdminCard();

    // expect to see admin screen
    screen.getByText('Election Admin Actions');
  });

  it('Displays "discharging battery" warning message and "discharging battery + low battery" error screen', async () => {
    const card = new MemoryCard();
    const storage = new MemoryStorage();
    const machineConfig = fakeMachineConfigProvider();
    const hardware = MemoryHardware.buildStandard();
    await setElectionInStorage(storage);
    await setStateInStorage(storage);
    render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
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
  });
});
