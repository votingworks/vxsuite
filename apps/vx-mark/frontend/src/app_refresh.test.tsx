import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { advanceBy } from 'jest-date-mock';

import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';
import { makeVoterCard } from '@votingworks/test-utils';
import { App } from './app';

import {
  advanceTimers,
  advanceTimersAndPromises,
} from '../test/helpers/smartcards';

import {
  election,
  presidentContest,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
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

it('Refresh window and expect to be on same contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  await setElectionInStorage(storage);
  await setStateInStorage(storage);

  let { getByText, unmount } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  // Insert Voter Card
  card.insertCard(makeVoterCard(election));
  advanceTimers();

  // Go to First Contest
  await waitFor(() => fireEvent.click(getByText('Start Voting')));

  // ====================== END CONTEST SETUP ====================== //

  const candidate0 = presidentContest.candidates[0].name;

  getByText(presidentContest.title);

  // Select first candidate
  fireEvent.click(getByText(candidate0));
  advanceTimers();
  expect(getByText(candidate0).closest('button')!.dataset['selected']).toEqual(
    'true'
  );

  // advance time by CARD_LONG_VALUE_WRITE_DELAY to let background interval write to card
  advanceBy(1000);
  await waitFor(() => {
    // nothing?
  });

  unmount();
  apiMock.mockApiClient.assertComplete();
  apiMock.mockApiClient.reset();
  apiMock.expectGetMachineConfig();
  ({ getByText, unmount } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  ));

  await advanceTimersAndPromises();

  // App is on first contest
  await waitFor(() => getByText(presidentContest.title));

  // First candidate selected
  expect(getByText(candidate0).closest('button')!.dataset['selected']).toEqual(
    'true'
  );
});
