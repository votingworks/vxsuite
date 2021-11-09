import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import { App } from './app';
import { DemoApp, getDemoStorage } from './demo_app';
import { activationStorageKey, electionStorageKey } from './app_root';

import {
  election,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

describe('loads election', () => {
  it('Machine is not configured by default', async () => {
    const hardware = await MemoryHardware.buildStandard();
    render(
      <App
        machineConfig={fakeMachineConfigProvider()}
        card={new MemoryCard()}
        hardware={hardware}
        reload={jest.fn()}
      />
    );

    // Let the initial hardware detection run.
    await advanceTimersAndPromises();

    screen.getByText('Device Not Configured');
  });

  it('from storage', async () => {
    const card = new MemoryCard();
    const storage = new MemoryStorage();
    const machineConfig = fakeMachineConfigProvider();
    const hardware = await MemoryHardware.buildStandard();
    await setElectionInStorage(storage);
    await setStateInStorage(storage);
    render(
      <App
        card={card}
        storage={storage}
        machineConfig={machineConfig}
        hardware={hardware}
        reload={jest.fn()}
      />
    );

    // Let the initial hardware detection run.
    await advanceTimersAndPromises();

    screen.getByText(election.title);
    expect(storage.get(electionStorageKey)).toBeTruthy();
  });

  it('demo app loads election and activates ballot', async () => {
    const storage = getDemoStorage();
    render(<DemoApp storage={storage} reload={jest.fn()} />);

    // Let the initial hardware detection run.
    await advanceTimersAndPromises();
    await advanceTimersAndPromises();

    expect(screen.getAllByText(election.title).length).toBeGreaterThan(1);
    screen.getByText(/Center Springfield/);
    screen.getByText(/ballot style 12/);
    expect(storage.get(electionStorageKey)).toBeTruthy();
    expect(storage.get(activationStorageKey)).toBeTruthy();
  });
});
