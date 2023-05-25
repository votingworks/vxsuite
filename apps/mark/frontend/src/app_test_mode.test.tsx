import React from 'react';
import userEvent from '@testing-library/user-event';
import {
  asElectionDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { render, screen, waitFor } from '../test/react_testing_library';

import { setStateInStorage } from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { App } from './app';

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

it('Prompts to change from test mode to live mode on election day', async () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleDefinition.election,
    date: new Date().toISOString(),
  });
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionDefinition(electionDefinition);
  await setStateInStorage(storage, {
    isLiveMode: false,
  });
  render(
    <App
      apiClient={apiMock.mockApiClient}
      hardware={hardware}
      storage={storage}
    />
  );

  await screen.findByText('Test Ballot Mode');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText(
    'Switch to Official Ballot Mode and reset the Ballots Printed count?'
  );
  userEvent.click(
    screen.getByRole('button', { name: 'Switch to Official Ballot Mode' })
  );
  await waitFor(() =>
    expect(screen.queryByText('Test Ballot Mode')).toBeNull()
  );
});
