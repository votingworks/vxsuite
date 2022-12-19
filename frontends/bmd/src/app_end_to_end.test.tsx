import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { advanceBy } from 'jest-date-mock';
import {
  makeElectionManagerCard,
  makeInvalidPollWorkerCard,
  makeVoterCard,
  makePollWorkerCard,
  getZeroCompressedTally,
  makeSystemAdministratorCard,
  expectPrint,
} from '@votingworks/test-utils';
import {
  MemoryStorage,
  MemoryCard,
  MemoryHardware,
  ReportSourceMachineType,
} from '@votingworks/utils';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import * as GLOBALS from './config/globals';

import { electionSampleDefinition } from './data';

import { App } from './app';

import { withMarkup } from '../test/helpers/with_markup';

import {
  advanceTimersAndPromises,
  makeAlternateNewVoterCard,
  makeUsedVoterCard,
} from '../test/helpers/smartcards';

import {
  presidentContest,
  countyCommissionersContest,
  measure102Contest,
  measure420Contest,
  voterContests,
} from '../test/helpers/election';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { MarkAndPrint } from './config/types';
import { REPORT_PRINTING_TIMEOUT_SECONDS } from './config/globals';
import { enterPin } from '../test/test_utils';

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

jest.setTimeout(15000);

test('MarkAndPrint end-to-end flow', async () => {
  const logger = fakeLogger();
  const electionDefinition = electionSampleDefinition;
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider({
    appMode: MarkAndPrint,
    screenOrientation: 'portrait',
  });
  const expectedElectionHash = electionDefinition.electionHash.substring(0, 10);
  const writeLongUint8ArrayMock = jest.spyOn(card, 'writeLongUint8Array');
  const reload = jest.fn();
  render(
    <App
      card={card}
      hardware={hardware}
      machineConfig={machineConfig}
      storage={storage}
      reload={reload}
      logger={logger}
    />
  );
  await advanceTimersAndPromises();
  const electionManagerCard = makeElectionManagerCard(
    electionDefinition.electionHash
  );
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  const invalidPollWorkerCard = makeInvalidPollWorkerCard();
  const getByTextWithMarkup = withMarkup(screen.getByText);

  card.removeCard();
  await advanceTimersAndPromises();

  // Default Unconfigured
  screen.getByText('VxMark is Not Configured');

  // ---------------

  // Configure with Election Manager Card
  card.insertCard(electionManagerCard, electionDefinition.electionData);
  await enterPin();
  userEvent.click(screen.getByText('Load Election Definition'));

  await advanceTimersAndPromises();
  screen.getByText('Election Definition is loaded.');

  // Remove card and expect not configured because precinct not selected
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('VxMark is Not Configured');

  // Basic auth logging check
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AuthLogin,
    'election_manager',
    expect.objectContaining({ disposition: 'success' })
  );

  // ---------------

  // Configure election with Election Manager Card
  card.insertCard(electionManagerCard, electionDefinition.electionData);
  await enterPin();
  screen.getByLabelText('Precinct');
  screen.queryByText(`Election ID: ${expectedElectionHash}`);
  screen.queryByText('Machine ID: 000');

  // Select precinct
  screen.getByText('State of Hamilton');
  userEvent.selectOptions(
    screen.getByLabelText('Precinct'),
    screen.getByText('Center Springfield')
  );
  within(screen.getByTestId('electionInfoBar')).getByText(/Center Springfield/);

  userEvent.click(screen.getByText('Live Election Mode'));
  expect(
    screen.getByText<HTMLButtonElement>('Live Election Mode').disabled
  ).toBeTruthy();

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Using an invalid Poll Worker Card shows an error
  card.insertCard(invalidPollWorkerCard);
  await advanceTimersAndPromises();
  screen.getByText('Invalid Card Data');
  screen.getByText('Card is not configured for this election.');
  screen.getByText('Please ask admin for assistance.');
  card.removeCard();
  await advanceTimersAndPromises();

  // ---------------

  // Open Polls with Poll Worker Card
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  screen.queryByText(`Election ID: ${expectedElectionHash}`);
  userEvent.click(screen.getByText('Open Polls'));
  userEvent.click(screen.getByText('Open Polls on VxMark Now'));
  screen.getByText('Select Voter’s Ballot Style');
  // Force refresh
  userEvent.click(screen.getByText('View More Actions'));
  userEvent.click(screen.getByText('Reset Accessible Controller'));
  expect(reload).toHaveBeenCalledTimes(1);
  await screen.findByText('Close Polls');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // ---------------

  // Voter partially votes, remove card, and is on insert card screen.
  card.insertCard(makeVoterCard(electionDefinition.election));
  await advanceTimersAndPromises();
  screen.getByText(/Center Springfield/);
  expect(screen.queryByText(expectedElectionHash)).toBeNull();
  screen.getByText(/(12)/);
  getByTextWithMarkup('Your ballot has 21 contests.');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // ---------------

  // Alternate Precinct
  card.insertCard(makeAlternateNewVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Invalid Card Data');
  screen.getByText('Card is not configured for this precinct.');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // ---------------

  // Complete Voter Happy Path

  // Insert Voter card
  card.insertCard(makeVoterCard(electionDefinition.election));
  await advanceTimersAndPromises();
  screen.getByText(/Center Springfield/);
  screen.getByText(/(12)/);
  getByTextWithMarkup('Your ballot has 21 contests.');

  // Adjust Text Size on Start Page
  expect(screen.getAllByLabelText('Text Size:', { exact: false }).length).toBe(
    3
  );
  userEvent.click(screen.getByLabelText('Text Size: Large'));
  expect(window.document.documentElement.style.fontSize).toBe('36px');
  userEvent.click(screen.getByLabelText('Selected Text Size: Large'));
  expect(window.document.documentElement.style.fontSize).toBe('36px');
  userEvent.click(screen.getByLabelText('Text Size: Medium'));
  expect(window.document.documentElement.style.fontSize).toBe('28px');
  userEvent.click(screen.getByLabelText('Text Size: Small'));
  expect(window.document.documentElement.style.fontSize).toBe('22px');

  // Start Voting
  userEvent.click(screen.getByText('Start Voting'));

  // Initial empty votes written to the card after tapping "Start Voting".
  await advanceTimersAndPromises();
  expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(1);

  // Adjust Text Size in Settings Modal
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('Voter Settings');
  expect(screen.getAllByLabelText('Text Size:', { exact: false }).length).toBe(
    3
  );
  userEvent.keyboard('{ArrowRight}');
  expect(screen.getByLabelText('Selected Text Size: Small')).toHaveFocus();
  userEvent.keyboard('{ArrowRight}');
  expect(screen.getByLabelText('Text Size: Medium')).toHaveFocus();
  userEvent.keyboard('{ArrowLeft}');
  expect(screen.getByLabelText('Selected Text Size: Small')).toHaveFocus();
  userEvent.click(screen.getByLabelText('Text Size: Large'));
  expect(window.document.documentElement.style.fontSize).toBe('36px');
  userEvent.click(screen.getByText('Done'));
  expect(screen.queryByText('Voter Settings')).not.toBeInTheDocument();
  expect(window.document.documentElement.style.fontSize).toBe('36px');

  // Use Default Settings
  userEvent.click(screen.getByText('Settings'));
  userEvent.click(screen.getByText('Use Default Settings'));
  expect(screen.queryByText('Voter Settings')).not.toBeInTheDocument();
  expect(window.document.documentElement.style.fontSize).toBe('28px');

  // Update Settings to use non default text size for voting session
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('Voter Settings');
  userEvent.click(screen.getByLabelText('Text Size: Large'));
  expect(window.document.documentElement.style.fontSize).toBe('36px');
  userEvent.click(screen.getByText('Done'));

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i += 1) {
    const { title } = voterContests[i];

    await advanceTimersAndPromises();
    screen.getByText(title);

    // Vote for candidate contest
    if (title === presidentContest.title) {
      userEvent.click(screen.getByText(presidentContest.candidates[0].name));
      await advanceTimersAndPromises(); // Update the vote being saved internally

      // We write to the card when no changes to the ballot state have happened for a second.
      // To test that this is happening, we advance time by a bit more than a second
      // We also need to advance timers so the interval will run, see that time has passed,
      // and finally write to the card.
      advanceBy(1100);
      await advanceTimersAndPromises();
      expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(2);

      // If we wait another second and advance timers, without any change made to the card,
      // we should not see another call to save the card data
      advanceBy(1100);
      await advanceTimersAndPromises();
      expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(2);
    }

    // Vote for yesno contest
    else if (title === measure102Contest.title) {
      userEvent.click(
        within(screen.getByTestId('contest-choices')).getByText('Yes')
      );
    }

    // Vote for MsEitherNeither contest
    else if (title === measure420Contest.title) {
      userEvent.click(screen.getByText(measure420Contest.neitherOption.label));
      userEvent.click(screen.getByText(measure420Contest.firstOption.label));
    }

    userEvent.click(screen.getByText('Next'));
  }

  // Review Screen
  await advanceTimersAndPromises();
  screen.getByText('Review Your Votes');

  // Review Screen has Voter Settings
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('Voter Settings');
  userEvent.click(screen.getByText('Done'));

  // Check for votes
  screen.getByText(presidentContest.candidates[0].name);
  screen.getByText(`Yes on ${measure102Contest.shortTitle}`);

  // Change "County Commissioners" Contest
  userEvent.click(
    getByTextWithMarkup(
      `${countyCommissionersContest.section}${countyCommissionersContest.title}`
    )
  );
  await advanceTimersAndPromises();
  screen.getByText(/Vote for 4/i);

  // Select first candidate
  userEvent.click(
    screen.getByText(countyCommissionersContest.candidates[0].name)
  );
  userEvent.click(
    screen.getByText(countyCommissionersContest.candidates[1].name)
  );

  // Back to Review screen
  userEvent.click(screen.getByText('Review'));
  await advanceTimersAndPromises();
  screen.getByText('Review Your Votes');
  screen.getByText(countyCommissionersContest.candidates[0].name);
  screen.getByText(countyCommissionersContest.candidates[1].name);
  screen.getByText('You may still vote for 2 more candidates.');

  // Print Screen
  userEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'));
  screen.getByText('Printing Your Official Ballot');
  await expectPrint();

  // Mark card used and then read card again
  await advanceTimersAndPromises();

  // Font Size is still custom user setting
  expect(window.document.documentElement.style.fontSize).toBe('36px');

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);

  // Reset Ballot is called with instructions type "card"
  // Show Verify and Scan Instructions
  screen.getByText('You’re Almost Done');
  screen.getByText('3. Return the card.');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // Font size has been reset to default on Insert Card screen
  expect(window.document.documentElement.style.fontSize).toBe('28px');

  // Insert Voter card which has just printed, it should say "used card"
  card.insertCard(makeUsedVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Used Card');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // ---------------

  // Close Polls with Poll Worker Card
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  userEvent.click(screen.getByText('View More Actions'));
  userEvent.click(screen.getByText('Close Polls'));
  userEvent.click(screen.getByText('Close Polls on VxMark Now'));

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Voting is complete.');

  // Insert pollworker card with precinct scanner tally
  card.insertCard(
    pollWorkerCard,
    JSON.stringify({
      tally: getZeroCompressedTally(electionDefinition.election),
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      machineId: '0002',
      timeSaved: new Date('2020-10-31').getTime(),
      timePollsTransitioned: new Date('2020-10-31').getTime(),
      precinctSelection: {
        kind: 'SinglePrecinct',
        precinctId: '23',
      },
      totalBallotsScanned: 10,
      isLiveMode: true,
      pollsTransition: 'close_polls',
      ballotCounts: {
        'undefined--ALL_PRECINCTS': [5, 5],
        'undefined--23': [5, 5],
      },
    })
  );
  expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(3);
  await advanceTimersAndPromises();
  await screen.findByText('Polls Closed Report on Card');
  userEvent.click(screen.getByText('Print Report'));
  await advanceTimersAndPromises();
  screen.getByText('Printing polls closed report');
  await advanceTimersAndPromises(REPORT_PRINTING_TIMEOUT_SECONDS);
  await expectPrint();
  userEvent.click(await screen.findByText('Continue'));

  expect(writeLongUint8ArrayMock).toHaveBeenCalledTimes(4);
  expect(writeLongUint8ArrayMock).toHaveBeenNthCalledWith(4, new Uint8Array());
  card.removeCard();
  await advanceTimersAndPromises();

  // Insert System Administrator card
  card.insertCard(makeSystemAdministratorCard());
  await enterPin();
  await screen.findByText('Reboot from USB');
  card.removeCard();
  await advanceTimersAndPromises();

  // ---------------

  // Unconfigure with Election Manager Card
  card.insertCard(electionManagerCard, electionDefinition.electionData);
  await enterPin();
  screen.getByText('Election Definition is loaded.');
  userEvent.click(screen.getByText('Unconfigure Machine'));
  await advanceTimersAndPromises();

  // Default Unconfigured
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('VxMark is Not Configured');

  // Insert System Administrator card works when unconfigured
  card.insertCard(makeSystemAdministratorCard());
  await enterPin();
  await screen.findByText('Reboot from USB');
  card.removeCard();
  await advanceTimersAndPromises();

  // ---------------

  // Configure with Election Manager card
  card.insertCard(electionManagerCard, electionDefinition.electionData);
  await enterPin();
  userEvent.click(
    screen.getByRole('button', { name: 'Load Election Definition' })
  );
  await screen.findByText('Election Definition is loaded.');
  card.removeCard();
  await advanceTimersAndPromises();

  // Unconfigure with System Administrator card
  card.insertCard(makeSystemAdministratorCard());
  await enterPin();
  userEvent.click(screen.getByRole('button', { name: 'Unconfigure Machine' }));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', {
      name: 'Yes, Delete Election Data',
    })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  card.removeCard();
  await advanceTimersAndPromises();

  // Verify that machine was unconfigured
  screen.getByText('VxMark is Not Configured');
  card.insertCard(electionManagerCard, electionDefinition.electionData);
  await enterPin();
  screen.getByText('Election Definition is not loaded.');
});
