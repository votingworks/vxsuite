import React from 'react';

import { MemoryStorage } from '@votingworks/utils';
import { advanceTimersAndPromises } from '@votingworks/test-utils';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { render, screen } from '../test/react_testing_library';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { App } from './app';
import { setStateInStorage } from '../test/helpers/election';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('machineConfig is fetched from api client by default', async () => {
  apiMock.expectGetMachineConfig({
    codeVersion: 'fake-code-version',
  });
  const storage = new MemoryStorage();
  apiMock.expectGetElectionDefinition(
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
