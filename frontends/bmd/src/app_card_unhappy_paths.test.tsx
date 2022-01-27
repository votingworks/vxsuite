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
} from '@votingworks/test-utils';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import { App } from './app';

import { CARD_EXPIRATION_SECONDS } from './config/globals';
import {
  advanceTimersAndPromises,
  makeExpiredVoterCard,
  makeOtherElectionVoterCard,
} from '../test/helpers/smartcards';

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { utcTimestamp } from './utils/utc_timestamp';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { PrintOnly } from './config/types';

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

test('Display App Card Unhappy Paths', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = await MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider();

  card.removeCard();

  await setElectionInStorage(storage);
  await setStateInStorage(storage);

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
      reload={jest.fn()}
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
  screen.getByText('Insert voter card to load ballot.');

  // ---------------

  // Insert used Voter card
  card.insertCard(makeVoidedVoterCard(electionSample));
  await advanceTimersAndPromises();
  screen.getByText('Expired Card');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert voter card to load ballot.');

  // ---------------

  // Insert expired Voter card
  card.insertCard(makeExpiredVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Expired Card');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert voter card to load ballot.');

  // ---------------

  // Voter Card which eventually expires
  const expiringCard = makeVoterCard(electionSample, {
    c: utcTimestamp() - CARD_EXPIRATION_SECONDS + 5 * 60, // 5 minutes until expiration
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
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert voter card to load ballot.');

  // Reinsert expired card
  card.insertCard(makeExpiredVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Expired Card');

  // Remove Card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert voter card to load ballot.');

  // ---------------
});

test('Inserting voter card when machine is unconfigured does nothing', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = await MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider();

  card.removeCard();

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  // ====================== END CONTEST SETUP ====================== //

  // Default Unconfigured
  screen.getByText('Device Not Configured');

  card.insertCard(makeVoterCard(electionSample));
  await advanceTimersAndPromises();

  screen.getByText('Device Not Configured');
});

test('Inserting pollworker card with invalid long data fall back as if there is no long data', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = await MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider({ appMode: PrintOnly });

  card.removeCard();

  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage, {
    isPollsOpen: false,
  });

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
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
  screen.getByText('Open/Close Polls');

  // No prompt to print precinct tally report
  expect(await screen.queryAllByText('Tally Report on Card')).toHaveLength(0);
});

test('Shows card backwards screen when card connection error occurs', async () => {
  const card = new MemoryCard();
  const hardware = await MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider();

  await setElectionInStorage(storage);
  await setStateInStorage(storage);

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  card.insertCard(undefined, undefined, 'error');
  await advanceTimersAndPromises();
  screen.getByText('Card is backwards');
  screen.getByText('Remove the card, turn it around, and insert it again.');

  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');
});
