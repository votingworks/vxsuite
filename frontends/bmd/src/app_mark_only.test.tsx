import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  makeAdminCard,
  makeVoterCard,
  makePollWorkerCard,
} from '@votingworks/test-utils';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';
import { electionSampleDefinition } from './data';

import { App } from './app';

import { withMarkup } from '../test/helpers/with_markup';

import {
  advanceTimersAndPromises,
  makeExpiredVoterCard,
} from '../test/helpers/smartcards';

import {
  presidentContest,
  measure102Contest,
  voterContests,
} from '../test/helpers/election';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';

jest.setTimeout(10_000);

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

it('MarkOnly flow', async () => {
  const electionDefinition = electionSampleDefinition;
  const card = new MemoryCard();
  const adminCard = makeAdminCard(electionDefinition.electionHash);
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider();
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
  const getByTextWithMarkup = withMarkup(screen.getByText);

  card.removeCard();
  await advanceTimersAndPromises();

  // Default Unconfigured
  screen.getByText('Device Not Configured');

  // ---------------

  // Configure election with Admin Card
  card.insertCard(adminCard, electionDefinition.electionData);
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText('Load Election Definition'));

  await advanceTimersAndPromises();
  screen.getByText('Election definition is loaded.');

  // Remove card and expect not configured because precinct not selected
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Device Not Configured');

  // ---------------

  // Configure election with Admin Card
  card.insertCard(adminCard, electionDefinition.electionData);
  await advanceTimersAndPromises();
  screen.getByLabelText('Precinct');

  // select precinct
  screen.getByText('State of Hamilton');
  const precinctSelect = screen.getByLabelText('Precinct');
  const precinctId = (within(precinctSelect).getByText(
    'Center Springfield'
  ) as HTMLOptionElement).value;
  fireEvent.change(precinctSelect, { target: { value: precinctId } });
  within(screen.getByTestId('election-info')).getByText('Center Springfield');

  fireEvent.click(screen.getByText('Live Election Mode'));
  expect(
    (screen.getByText('Live Election Mode') as HTMLButtonElement).disabled
  ).toBeTruthy();

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Open Polls with Poll Worker Card
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText('Open Polls for Center Springfield'));
  screen.getByText('Close Polls for Center Springfield');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert voter card to load ballot.');

  // ---------------

  // Insert Expired Voter Card
  card.insertCard(makeExpiredVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Expired Card');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // // ---------------

  // Insert Expired Voter Card With Votes
  card.insertCard(makeExpiredVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Expired Card');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // ---------------

  // Complete MarkOnly Voter Happy Path

  // Insert Voter card
  card.insertCard(makeVoterCard(electionDefinition.election));
  await advanceTimersAndPromises();
  screen.getByText(/Center Springfield/);
  screen.getByText(/ballot style 12/);
  getByTextWithMarkup('Your ballot has 21 contests.');
  fireEvent.click(screen.getByText('Start Voting'));

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i += 1) {
    const { title } = voterContests[i];

    await advanceTimersAndPromises();
    screen.getByText(title);

    // Vote for candidate contest
    if (title === presidentContest.title) {
      fireEvent.click(screen.getByText(presidentContest.candidates[0].name));
    }
    // Vote for yesno contest
    else if (title === measure102Contest.title) {
      fireEvent.click(screen.getByText('Yes'));
    }

    fireEvent.click(screen.getByText('Next'));
  }

  // Review Screen
  await advanceTimersAndPromises();
  screen.getByText('Review Your Votes');
  screen.getByText(presidentContest.candidates[0].name);
  screen.getByText(`Yes on ${measure102Contest.shortTitle}`);

  // Print Screen
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'));
  await advanceTimersAndPromises();

  // Saving votes
  screen.getByText('Saving your votes to the card');
  await advanceTimersAndPromises(2.5); // redirect after 2.5 seconds

  // Review and Cast Instructions
  screen.getByText('Take your card to the Ballot Printer.');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert voter card to load ballot.');

  // ---------------

  // Close Polls with Poll Worker Card
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText('Close Polls for Center Springfield'));
  screen.getByText('Open Polls for Center Springfield');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Unconfigure with Admin Card
  card.insertCard(adminCard, electionDefinition.electionData);
  await advanceTimersAndPromises();
  screen.getByText('Election definition is loaded.');
  fireEvent.click(screen.getByText('Unconfigure Machine'));
  await advanceTimersAndPromises();

  // Default Unconfigured
  screen.getByText('Device Not Configured');
});
