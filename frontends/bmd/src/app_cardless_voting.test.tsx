import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';
import { makeAdminCard, makePollWorkerCard } from '@votingworks/test-utils';
import * as GLOBALS from './config/globals';

import { electionSampleDefinition } from './data';

import { App } from './app';

import {
  setElectionInStorage,
  setStateInStorage,
  presidentContest,
  voterContests,
} from '../test/helpers/election';

import { withMarkup } from '../test/helpers/with_markup';

import { advanceTimersAndPromises } from '../test/helpers/smartcards';

import { fakePrinter } from '../test/helpers/fake_printer';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { MarkAndPrint } from './config/types';

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

jest.setTimeout(15000);

test('Cardless Voting Flow', async () => {
  const electionDefinition = electionSampleDefinition;
  const { electionData, electionHash } = electionDefinition;
  const card = new MemoryCard();
  const adminCard = makeAdminCard(electionHash);
  const pollWorkerCard = makePollWorkerCard(electionHash);
  const hardware = MemoryHardware.buildStandard();
  const printer = fakePrinter();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider({
    appMode: MarkAndPrint,
  });
  render(
    <App
      card={card}
      hardware={hardware}
      machineConfig={machineConfig}
      printer={printer}
      storage={storage}
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

  // Configure with Admin Card
  card.insertCard(adminCard, electionData);
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText('Load Election Definition'));

  await advanceTimersAndPromises();
  screen.getByText('Election definition is loaded.');
  screen.getByLabelText('Precinct');
  screen.queryByText(`Election ID: ${electionHash.slice(0, 10)}`);

  // Select precinct
  screen.getByText('State of Hamilton');
  const precinctSelect = screen.getByLabelText('Precinct');
  const precinctId =
    within(precinctSelect).getByText<HTMLOptionElement>(
      'Center Springfield'
    ).value;
  fireEvent.change(precinctSelect, { target: { value: precinctId } });
  within(screen.getByTestId('election-info')).getByText('Center Springfield');

  fireEvent.click(screen.getByText('Live Election Mode'));
  expect(
    screen.getByText<HTMLButtonElement>('Live Election Mode').disabled
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

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert voter card to load ballot.');

  // ---------------

  // Activate Voter Session for Cardless Voter
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  screen.getByText('Activate Voter Session');
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));
  screen.getByText('Voter session activated: 12');

  // Poll Worker deactivates ballot style
  fireEvent.click(screen.getByText('Deactivate Voter Session'));
  screen.getByText('Activate Voter Session');

  // Poll Worker reactivates ballot style
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));

  // Poll Worker removes their card
  card.removeCard();
  await advanceTimersAndPromises();

  // Voter Ballot Style is active
  screen.getByText(/ballot style 12/);
  getByTextWithMarkup('Your ballot has 21 contests.');
  fireEvent.click(screen.getByText('Start Voting'));

  // Voter votes in first contest
  fireEvent.click(screen.getByText(presidentContest.candidates[0].name));
  fireEvent.click(screen.getByText('Next'));

  // Poll Worker inserts card and sees message that there are votes
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  screen.getByText('Ballot Contains Votes');

  // Poll Worker resets ballot to remove votes
  fireEvent.click(screen.getByText('Reset Ballot'));

  // Back on Poll Worker screen
  screen.getByText('Activate Voter Session');

  // Activates Ballot Style again
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));
  screen.getByText('Voter session activated: 12');

  // Poll Worker removes their card
  card.removeCard();
  await advanceTimersAndPromises();

  // Voter Ballot Style is active
  screen.getByText(/ballot style 12/);
  getByTextWithMarkup('Your ballot has 21 contests.');
  fireEvent.click(screen.getByText('Start Voting'));

  // Voter makes selection in first contest and then advances to review screen
  for (let i = 0; i < voterContests.length; i += 1) {
    const { title } = voterContests[i];

    await advanceTimersAndPromises();
    screen.getByText(title);

    // Vote for a candidate contest
    if (title === presidentContest.title) {
      fireEvent.click(screen.getByText(presidentContest.candidates[0].name));
    }

    fireEvent.click(screen.getByText('Next'));
  }

  // Advance to print ballot
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'));
  screen.getByText('Printing Official Ballot');

  // Trigger seal image loaded
  fireEvent.load(screen.getByTestId('printed-ballot-seal-image'));

  // Reset ballot
  await advanceTimersAndPromises();

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);

  // Reset Ballot is called with instructions type "cardless"
  // Show Verify and Scan Instructions
  screen.getByText('You’re Almost Done');
  expect(
    screen.queryByText('3. Return the card to a poll worker.')
  ).toBeFalsy();

  // Wait for timeout to return to Insert Card screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_INSTRUCTIONS_TIMEOUT_SECONDS);
  screen.getByText('Insert voter card to load ballot.');
});

test('Another Voter submits blank ballot and clicks Done', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const electionDefinition = electionSampleDefinition;
  const card = new MemoryCard();
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  const hardware = MemoryHardware.buildStandard();
  const printer = fakePrinter();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider({
    appMode: MarkAndPrint,
  });

  card.removeCard();

  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage);

  render(
    <App
      card={card}
      hardware={hardware}
      printer={printer}
      storage={storage}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  const getByTextWithMarkup = withMarkup(screen.getByText);

  // ====================== END CONTEST SETUP ====================== //

  // Activate Voter Session for Cardless Voter
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));
  screen.getByText('Voter session activated: 12');

  // Poll Workder removes their card
  card.removeCard();
  await advanceTimersAndPromises();

  // Voter Ballot Style is active
  screen.getByText(/ballot style 12/);
  getByTextWithMarkup('Your ballot has 21 contests.');
  fireEvent.click(screen.getByText('Start Voting'));

  // Voter advances through contests without voting in any
  for (let i = 0; i < voterContests.length; i += 1) {
    const { title } = voterContests[i];

    await advanceTimersAndPromises();
    screen.getByText(title);

    fireEvent.click(screen.getByText('Next'));
  }

  // Advance to print ballot
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'));
  screen.getByText('Printing Official Ballot');

  // Trigger seal image loaded
  fireEvent.load(screen.getByTestId('printed-ballot-seal-image'));

  // Reset ballot
  await advanceTimersAndPromises();

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);

  // Reset Ballot is called with instructions type "cardless"
  // Show Verify and Scan Instructions
  screen.getByText('You’re Almost Done');
  expect(
    screen.queryByText('3. Return the card to a poll worker.')
  ).toBeFalsy();

  // Click "Done" to get back to Insert Card screen
  fireEvent.click(screen.getByText('Done'));
  await advanceTimersAndPromises();
  screen.getByText('Insert voter card to load ballot.');
});

test('poll worker must select a precinct first', async () => {
  const electionDefinition = electionSampleDefinition;
  const { electionData, electionHash } = electionDefinition;
  const card = new MemoryCard();
  const adminCard = makeAdminCard(electionHash);
  const pollWorkerCard = makePollWorkerCard(electionHash);
  const hardware = MemoryHardware.buildStandard();
  const printer = fakePrinter();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider({
    appMode: MarkAndPrint,
  });
  render(
    <App
      card={card}
      hardware={hardware}
      machineConfig={machineConfig}
      printer={printer}
      storage={storage}
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

  // Configure with Admin Card
  card.insertCard(adminCard, electionData);
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText('Load Election Definition'));

  await advanceTimersAndPromises();
  screen.getByText('Election definition is loaded.');
  screen.getByLabelText('Precinct');
  screen.queryByText(`Election ID: ${electionHash.slice(0, 10)}`);

  // Select precinct
  screen.getByText('State of Hamilton');
  const precinctSelect = screen.getByLabelText('Precinct');
  const precinctId =
    within(precinctSelect).getByText<HTMLOptionElement>('All Precincts').value;
  fireEvent.change(precinctSelect, { target: { value: precinctId } });
  within(screen.getByTestId('election-info')).getByText('All Precincts');

  fireEvent.click(screen.getByText('Live Election Mode'));
  expect(
    screen.getByText<HTMLButtonElement>('Live Election Mode').disabled
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
  fireEvent.click(screen.getByText('Open Polls for All Precincts'));

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert voter card to load ballot.');

  // ---------------

  // Activate Voter Session for Cardless Voter
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  screen.getByText('Activate Voter Session');
  fireEvent.click(
    within(screen.getByTestId('precincts')).getByText('Center Springfield')
  );
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));
  screen.getByText('Voter session activated: 12 @ Center Springfield');

  // Poll Worker deactivates ballot style
  fireEvent.click(screen.getByText('Deactivate Voter Session'));
  screen.getByText('Activate Voter Session');

  // Poll Worker reactivates ballot style
  fireEvent.click(
    within(screen.getByTestId('precincts')).getByText('Center Springfield')
  );
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));

  // Poll Worker removes their card
  card.removeCard();
  await advanceTimersAndPromises();

  // Voter Ballot Style is active
  screen.getByText(/ballot style 12/);
  getByTextWithMarkup('Your ballot has 21 contests.');
  fireEvent.click(screen.getByText('Start Voting'));

  // Voter votes in first contest
  fireEvent.click(screen.getByText(presidentContest.candidates[0].name));
  fireEvent.click(screen.getByText('Next'));

  // Poll Worker inserts card and sees message that there are votes
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  screen.getByText('Ballot Contains Votes');

  // Poll Worker resets ballot to remove votes
  fireEvent.click(screen.getByText('Reset Ballot'));

  // Back on Poll Worker screen
  screen.getByText('Activate Voter Session');

  // Activates Ballot Style again
  fireEvent.click(
    within(screen.getByTestId('precincts')).getByText('Center Springfield')
  );
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));
  screen.getByText('Voter session activated: 12 @ Center Springfield');

  // Poll Worker removes their card
  card.removeCard();
  await advanceTimersAndPromises();

  // Voter Ballot Style is active
  screen.getByText(/ballot style 12/);
  getByTextWithMarkup('Your ballot has 21 contests.');
  fireEvent.click(screen.getByText('Start Voting'));

  // Voter makes selection in first contest and then advances to review screen
  for (let i = 0; i < voterContests.length; i += 1) {
    const { title } = voterContests[i];

    await advanceTimersAndPromises();
    screen.getByText(title);

    // Vote for a candidate contest
    if (title === presidentContest.title) {
      fireEvent.click(screen.getByText(presidentContest.candidates[0].name));
    }

    fireEvent.click(screen.getByText('Next'));
  }

  // Advance to print ballot
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'));
  screen.getByText('Printing Official Ballot');

  // Trigger seal image loaded
  fireEvent.load(screen.getByTestId('printed-ballot-seal-image'));

  // Reset ballot
  await advanceTimersAndPromises();

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);

  // Reset Ballot is called with instructions type "cardless"
  // Show Verify and Scan Instructions
  screen.getByText('You’re Almost Done');
  expect(
    screen.queryByText('3. Return the card to a poll worker.')
  ).toBeFalsy();

  // Wait for timeout to return to Insert Card screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_INSTRUCTIONS_TIMEOUT_SECONDS);
  screen.getByText('Insert voter card to load ballot.');
});
