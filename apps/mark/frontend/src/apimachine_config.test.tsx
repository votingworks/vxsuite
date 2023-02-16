import React from 'react';
import { render, screen } from '@testing-library/react';

import { MemoryStorage } from '@votingworks/utils';
import { advanceTimersAndPromises } from '@votingworks/test-utils';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { App } from './app';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('machineConfig is fetched from api client by default', async () => {
  apiMock.expectGetMachineConfig({
    codeVersion: 'fake-code-version',
  });
  const storage = new MemoryStorage();
  await setElectionInStorage(
    storage,
    electionFamousNames2021Fixtures.electionDefinition
  );
  await setStateInStorage(storage);
  render(
    <App
      storage={storage}
      reload={jest.fn()}
      apiClient={apiMock.mockApiClient}
    />
  );
  await advanceTimersAndPromises();
  apiMock.setAuthStatusPollWorkerLoggedIn(
    electionFamousNames2021Fixtures.electionDefinition
  );
  await advanceTimersAndPromises();
  await screen.findByText('fake-code-version');
});
