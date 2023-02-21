import React from 'react';
import { render, screen } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { MemoryStorage, MemoryHardware } from '@votingworks/utils';
import { err } from '@votingworks/basics';

import { App } from './app';
import { advanceTimersAndPromises } from '../test/helpers/timers';

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
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

test('Poll worker card with invalid scanner report data is treated like card without scanner report data', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, {
    pollsState: 'polls_closed_initial',
  });

  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  // ====================== END CONTEST SETUP ====================== //

  screen.getByText('Insert Poll Worker card to open.');

  apiMock.setAuthStatusPollWorkerLoggedIn(electionSampleDefinition, {
    scannerReportDataReadResult: err(new Error('Invalid scanner report data')),
  });
  await advanceTimersAndPromises();

  // Land on pollworker screen
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));

  // No prompt to print precinct tally report
  expect(screen.queryAllByText('Tally Report on Card')).toHaveLength(0);
});

test('Shows card backwards screen when card connection error occurs', async () => {
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

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
  screen.getByText('Insert Card');

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'card_error',
  });
  await advanceTimersAndPromises();
  await screen.findByText('Card is Backwards');
  screen.getByText('Remove the card, turn it around, and insert it again.');

  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('Insert Card');
});
