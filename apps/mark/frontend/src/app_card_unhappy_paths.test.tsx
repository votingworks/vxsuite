import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  electionSampleDefinition as election,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import {
  makePollWorkerCard,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/smartcards';

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

test('Inserting pollworker card with invalid long data fall back as if there is no long data', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  card.removeCard();

  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, {
    pollsState: 'polls_closed_initial',
  });

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

  // ====================== END CONTEST SETUP ====================== //

  screen.getByText('Insert Poll Worker card to open.');

  const pollworkerCard = makePollWorkerCard(election.electionHash);
  card.insertCard(pollworkerCard, electionSampleDefinition.electionData);
  await advanceTimersAndPromises();

  // Land on pollworker screen
  screen.getByText(hasTextAcrossElements('Polls: Closed'));

  // No prompt to print precinct tally report
  expect(screen.queryAllByText('Tally Report on Card')).toHaveLength(0);
});

test('Shows card backwards screen when card connection error occurs', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

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
  screen.getByText('Insert Card');

  card.insertCard(undefined, undefined, 'error');
  await advanceTimersAndPromises();
  screen.getByText('Card is Backwards');
  screen.getByText('Remove the card, turn it around, and insert it again.');

  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');
});
