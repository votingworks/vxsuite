import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { fakeKiosk } from '@votingworks/test-utils';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/smartcards';

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';

import { QUIT_KIOSK_IDLE_SECONDS } from './config/globals';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  window.kiosk = fakeKiosk();
  apiMock = createApiMock();
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

test('Insert Card screen idle timeout to quit app', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig({
    // machineId used to determine whether we quit. Now they all do.
    // making sure a machineId that ends in 0 still triggers.
    machineId: '0000',
  });

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

  await advanceTimersAndPromises();

  // Ensure we're on the Insert Card screen
  screen.getByText('Insert Card');

  expect(window.kiosk?.quit).not.toHaveBeenCalled();

  // Check that we requested a quit after the idle timer fired.
  await advanceTimersAndPromises();
  await advanceTimersAndPromises(QUIT_KIOSK_IDLE_SECONDS);
  expect(window.kiosk?.quit).toHaveBeenCalledTimes(1);
});
