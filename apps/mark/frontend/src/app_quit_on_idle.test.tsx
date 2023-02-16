import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { fakeKiosk } from '@votingworks/test-utils';
import { MemoryStorage, MemoryHardware } from '@votingworks/utils';

import { electionSampleDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/smartcards';

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';

import {
  IDLE_RESET_TIMEOUT_SECONDS,
  IDLE_TIMEOUT_SECONDS,
  QUIT_KIOSK_IDLE_SECONDS,
} from './config/globals';
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

test('Voter idle timeout', async () => {
  const electionDefinition = electionSampleDefinition;
  const { electionHash } = electionDefinition;
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();
  await setElectionInStorage(storage, electionDefinition);
  await setStateInStorage(storage);
  render(
    <App
      apiClient={apiMock.mockApiClient}
      hardware={hardware}
      storage={storage}
    />
  );

  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });

  // Let idle timeout kick in and acknowledge
  userEvent.click(await screen.findByText('Start Voting'));
  await advanceTimersAndPromises(IDLE_TIMEOUT_SECONDS);
  screen.getByText('Are you still voting?');
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, I’m still voting.' })
  );
  await waitFor(() =>
    expect(screen.queryByText('Are you still voting?')).toBeNull()
  );

  // Let idle timeout kick in and don't acknowledge
  await advanceTimersAndPromises(IDLE_TIMEOUT_SECONDS);
  screen.getByText('Are you still voting?');
  apiMock.mockApiClient.endCardlessVoterSession
    .expectCallWith({ electionHash })
    .resolves();
  await advanceTimersAndPromises(IDLE_RESET_TIMEOUT_SECONDS);
  screen.getByText('Clearing ballot');
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
});
