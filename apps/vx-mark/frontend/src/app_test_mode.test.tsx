import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import { App } from './app';

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';
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

it('Displays testing message if not live mode', async () => {
  const card = new MemoryCard();
  const storage = new MemoryStorage();
  const hardware = MemoryHardware.buildStandard();
  apiMock.expectGetMachineConfig();
  await setElectionInStorage(storage);
  await setStateInStorage(storage, {
    isLiveMode: false,
  });
  render(
    <App
      card={card}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      hardware={hardware}
      reload={jest.fn()}
    />
  );

  // Let the initial hardware detection run.
  await advanceTimersAndPromises();

  screen.getByText('Machine is in Testing Mode');
});
