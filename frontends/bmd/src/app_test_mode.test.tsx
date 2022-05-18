import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import { App } from './app';

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

it('Displays testing message if not live mode', async () => {
  const card = new MemoryCard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider();
  const hardware = MemoryHardware.buildStandard();
  await setElectionInStorage(storage);
  await setStateInStorage(storage, {
    isLiveMode: false,
  });
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

  screen.getByText('Machine is in Testing Mode');
});
