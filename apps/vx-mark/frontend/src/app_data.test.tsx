import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import { App } from './app';
import { electionStorageKey } from './app_root';

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
    const hardware = MemoryHardware.buildStandard();
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

    screen.getByText('VxMark is Not Configured');
  });

  it('from storage', async () => {
    const card = new MemoryCard();
    const storage = new MemoryStorage();
    const machineConfig = fakeMachineConfigProvider();
    const hardware = MemoryHardware.buildStandard();
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
});
