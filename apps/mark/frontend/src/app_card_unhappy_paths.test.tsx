import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import {
  electionSample,
  electionSampleDefinition as election,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import {
  makeVoidedVoterCard,
  makeVoterCard,
  makePollWorkerCard,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import {
  MemoryStorage,
  MemoryCard,
  MemoryHardware,
  utcTimestamp,
} from '@votingworks/utils';

import { VOTER_CARD_EXPIRATION_SECONDS } from '@votingworks/ui';
import { PrintOnly } from '@votingworks/types';
import { App } from './app';

import {
  advanceTimersAndPromises,
  makeExpiredVoterCard,
  makeOtherElectionVoterCard,
} from '../test/helpers/smartcards';

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

test('Display App Card Unhappy Paths', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  card.removeCard();

  await setElectionInStorage(storage);
  await setStateInStorage(storage);

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      reload={jest.fn()}
      apiClient={apiMock.mockApiClient}
    />
  );
  await advanceTimersAndPromises();

  // ====================== END CONTEST SETUP ====================== //

  // Insert used Voter card
  card.insertCard(makeOtherElectionVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Card is not configured for this election.');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // ---------------

  // Insert used Voter card
  card.insertCard(makeVoidedVoterCard(electionSample));
  await advanceTimersAndPromises();
  screen.getByText('Expired Card');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // ---------------

  // Insert expired Voter card
  card.insertCard(makeExpiredVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Expired Card');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // ---------------

  // Voter Card which eventually expires
  const expiringCard = makeVoterCard(electionSample, {
    c: utcTimestamp() - VOTER_CARD_EXPIRATION_SECONDS + 5 * 60, // 5 minutes until expiration
  });

  // First Insert is Good
  card.insertCard(expiringCard);
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText('Start Voting'));

  // Slow voter clicks around, expiration Time passes, card still works.
  await advanceTimersAndPromises(60);
  fireEvent.mouseDown(document); // reset Idle Timer
  fireEvent.click(screen.getByText('Next'));
  await advanceTimersAndPromises(60);
  fireEvent.mouseDown(document); // reset Idle Timer
  fireEvent.click(screen.getByText('Next'));
  await advanceTimersAndPromises(60);
  fireEvent.mouseDown(document); // reset Idle Timer
  fireEvent.click(screen.getByText('Next'));
  await advanceTimersAndPromises(60);
  fireEvent.mouseDown(document); // reset Idle Timer
  fireEvent.click(screen.getByText('Next'));
  await advanceTimersAndPromises(60);
  fireEvent.mouseDown(document); // reset Idle Timer
  fireEvent.click(screen.getByText('Next'));
  await advanceTimersAndPromises(60);
  fireEvent.mouseDown(document); // reset Idle Timer
  fireEvent.click(screen.getByText('Next'));

  // Card expires, but card still works as expected.
  await advanceTimersAndPromises(60);
  fireEvent.mouseDown(document); // reset Idle Timer
  fireEvent.click(screen.getByText('Next'));
  await advanceTimersAndPromises(60);
  fireEvent.mouseDown(document); // reset Idle Timer
  fireEvent.click(screen.getByText('Next'));

  // Remove card
  await advanceTimersAndPromises();
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // Reinsert expired card
  card.insertCard(makeExpiredVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Expired Card');

  // Remove Card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // ---------------
});

test('Inserting voter card when machine is unconfigured does nothing', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  card.removeCard();

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

  // Default Unconfigured
  screen.getByText('VxMark is Not Configured');

  card.insertCard(makeVoterCard(electionSample));
  await advanceTimersAndPromises();

  screen.getByText('VxMark is Not Configured');
});

test('Inserting pollworker card with invalid long data fall back as if there is no long data', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig({ appMode: PrintOnly });

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
