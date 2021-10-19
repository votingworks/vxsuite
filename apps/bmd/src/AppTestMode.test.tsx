import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import App from './App';

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';

jest.useFakeTimers();

beforeEach(() => {
  window.location.href = '/';
});

it('Displays testing message if not live mode', async () => {
  const card = new MemoryCard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider();
  const hardware = await MemoryHardware.buildStandard();
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
    />
  );

  // Let the initial hardware detection run.
  await advanceTimersAndPromises();

  screen.getByText('Testing Mode');
});
