import React from 'react';
import { render, screen } from '@testing-library/react';

import { MemoryCard, MemoryStorage } from '@votingworks/shared';
import {
  advanceTimersAndPromises,
  makePollWorkerCard,
} from '@votingworks/test-utils';
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
  const card = new MemoryCard();
  await setElectionInStorage(
    storage,
    electionFamousNames2021Fixtures.electionDefinition
  );
  await setStateInStorage(storage);
  render(
    <App
      card={card}
      storage={storage}
      reload={jest.fn()}
      apiClient={apiMock.mockApiClient}
    />
  );
  await advanceTimersAndPromises();
  const pollWorkerCard = makePollWorkerCard(
    electionFamousNames2021Fixtures.electionDefinition.electionHash
  );
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  await screen.findByText('fake-code-version');
});
