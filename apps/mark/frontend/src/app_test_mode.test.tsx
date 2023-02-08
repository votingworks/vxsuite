import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  asElectionDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { makePollWorkerCard } from '@votingworks/test-utils';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { App } from './app';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

it('Prompts to change from test mode to live mode on election day', async () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleDefinition.election,
    date: new Date().toISOString(),
  });
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();
  await setElectionInStorage(storage, electionDefinition);
  await setStateInStorage(storage, {
    isLiveMode: false,
  });
  render(
    <App
      apiClient={apiMock.mockApiClient}
      card={card}
      hardware={hardware}
      storage={storage}
    />
  );

  await screen.findByText('Machine is in Testing Mode');
  card.insertCard(makePollWorkerCard(electionDefinition.electionHash));
  await screen.findByText(
    'Switch to Live Election Mode and reset the Ballots Printed count?'
  );
  userEvent.click(
    screen.getByRole('button', { name: 'Switch to Live Election Mode' })
  );
  await waitFor(() =>
    expect(screen.queryByText('Machine is in Testing Mode')).toBeNull()
  );
});
