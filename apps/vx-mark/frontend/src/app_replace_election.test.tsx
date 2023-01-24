import React from 'react';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { makeElectionManagerCard } from '@votingworks/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { electionSample2Definition } from '@votingworks/fixtures';
import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { enterPin, render } from '../test/test_utils';
import { App } from './app';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';
import { createApiMock } from '../test/helpers/mock_api_client';

const apiMock = createApiMock();

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock.mockApiClient.reset();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(15000);

test('replacing a loaded election with one from a card', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  // setup with typical election
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

  // insert election manager card with different election
  card.insertCard(
    makeElectionManagerCard(electionSample2Definition.electionHash),
    electionSample2Definition.electionData
  );
  await enterPin();
  await screen.findByText('This card is configured for a different election.');

  // unconfigure
  fireEvent.click(screen.getByText('Remove the Current Election and All Data'));
  await advanceTimersAndPromises();

  // take out and put card in again to allow loading
  card.removeCard();
  await advanceTimersAndPromises();
  card.insertCard(
    makeElectionManagerCard(electionSample2Definition.electionHash),
    electionSample2Definition.electionData
  );
  await enterPin();

  // load new election
  await screen.findByText('Election Manager Actions');
  fireEvent.click(screen.getByText('Load Election Definition'));
  await advanceTimersAndPromises();
  screen.getByText(electionSample2Definition.election.title);
});
