import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  asElectionDefinition,
  electionSample,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { encodeBallot } from '@votingworks/ballot-encoder';
import {
  makeAdminCard,
  makeVoterCard,
  makePollWorkerCard,
} from '@votingworks/test-utils';
import { BallotIdSchema, BallotType, unsafeParse } from '@votingworks/types';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import { App } from './app';

import {
  advanceTimersAndPromises,
  makeExpiredVoterCard,
  makeUsedVoterCard,
  sampleVotes1,
  sampleVotes2,
  sampleVotes3,
  makeAlternateNewVoterCard,
} from '../test/helpers/smartcards';

import { withMarkup } from '../test/helpers/with_markup';

import * as GLOBALS from './config/globals';
import { fakePrinter } from '../test/helpers/fake_printer';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { PrintOnly } from './config/types';

beforeEach(() => {
  window.location.href = '/';
  jest.useFakeTimers();
});

jest.setTimeout(12000);

test('PrintOnly flow', async () => {
  const { election, electionData, electionHash } = electionSampleDefinition;
  const card = new MemoryCard();
  const adminCard = makeAdminCard(electionHash);
  const pollWorkerCard = makePollWorkerCard(electionHash);
  const printer = fakePrinter();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider({ appMode: PrintOnly });
  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      printer={printer}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  const getAllByTextWithMarkup = withMarkup(screen.getAllByText);

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

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Device Not Configured');

  // ---------------

  // Configure election with Admin Card
  card.insertCard(adminCard, electionData);
  await advanceTimersAndPromises();
  screen.getByLabelText('Precinct');

  // Select precinct
  screen.getByText('State of Hamilton');
  const precinctSelect = screen.getByLabelText('Precinct');
  const precinctId = (within(precinctSelect).getByText(
    'Center Springfield'
  ) as HTMLOptionElement).value;
  fireEvent.change(precinctSelect, { target: { value: precinctId } });
  within(screen.getByTestId('election-info')).getByText('Center Springfield');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Open Polls in Testing Mode with Poll Worker Card
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText('Open Polls for Center Springfield'));
  screen.getByText('Close Polls for Center Springfield');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');
  expect(window.document.documentElement.style.fontSize).toBe('48px');

  // ---------------

  // Test for Testing Mode
  screen.getByText('Testing Mode');

  // ---------------

  // Set to Live Mode
  card.insertCard(adminCard, electionData);
  await advanceTimersAndPromises();
  expect(window.document.documentElement.style.fontSize).toBe('28px');
  fireEvent.click(screen.getByText('Live Election Mode'));

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();

  // Open Polls with Poll Worker Card
  fireEvent.click(screen.getByText('Open Polls for Center Springfield'));
  screen.getByText('Close Polls for Center Springfield');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');
  expect(window.document.documentElement.style.fontSize).toBe('48px');

  // Check Printed Ballots Count
  getAllByTextWithMarkup('Ballots Printed: 0');

  // ---------------

  // Insert Expired Voter Card
  card.insertCard(makeExpiredVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Expired Card');
  expect(window.document.documentElement.style.fontSize).toBe('48px');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');
  expect(window.document.documentElement.style.fontSize).toBe('48px');

  // ---------------

  // Insert Used Voter Card
  card.insertCard(makeUsedVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Used Card');
  expect(window.document.documentElement.style.fontSize).toBe('48px');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');
  expect(window.document.documentElement.style.fontSize).toBe('48px');

  // ---------------

  // Insert Voter Card with No Votes
  card.insertCard(makeVoterCard(election));
  await advanceTimersAndPromises();
  screen.getByText('Empty Card');
  expect(window.document.documentElement.style.fontSize).toBe('48px');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');
  expect(window.document.documentElement.style.fontSize).toBe('48px');

  // Insert Voter for Alternate Precinct
  card.insertCard(makeAlternateNewVoterCard());
  await advanceTimersAndPromises();
  screen.getByText('Invalid Card Data');
  screen.getByText('Card is not configured for this precinct.');
  expect(window.document.documentElement.style.fontSize).toBe('48px');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');
  expect(window.document.documentElement.style.fontSize).toBe('48px');

  // ---------------

  // Voter 1 Prints Ballot
  card.insertCard(
    makeVoterCard(electionSample),
    encodeBallot(election, {
      electionHash,
      ballotId: unsafeParse(BallotIdSchema, 'test-ballot-id'),
      ballotStyleId: election.ballotStyles[0].id,
      precinctId: election.precincts[0].id,
      votes: sampleVotes1,
      isTestMode: true,
      ballotType: BallotType.Standard,
    })
  );

  // Show Printing Ballot screen
  await advanceTimersAndPromises();
  screen.getByText('Printing your official ballot');

  // After timeout, show Verify and Scan Instructions
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);
  screen.getByText('Verify and Scan Your Official Ballot');
  expect(printer.print).toHaveBeenCalledTimes(1);

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // Check Printed Ballots Count
  getAllByTextWithMarkup('Ballots Printed: 1');

  // font size should not have changed (regression check)
  expect(window.document.documentElement.style.fontSize).toBe('48px');

  // ---------------

  // Voter 2 Prints Ballot
  card.insertCard(
    makeVoterCard(electionSample),
    encodeBallot(election, {
      electionHash,
      ballotId: unsafeParse(BallotIdSchema, 'test-ballot-id'),
      ballotStyleId: election.ballotStyles[0].id,
      precinctId: election.precincts[0].id,
      votes: sampleVotes2,
      isTestMode: true,
      ballotType: BallotType.Standard,
    })
  );

  // Show Printing Ballot screen
  await advanceTimersAndPromises();
  screen.getByText('Printing your official ballot');

  // After timeout, show Verify and Scan Instructions
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);
  screen.getByText('Verify and Scan Your Official Ballot');
  expect(printer.print).toHaveBeenCalledTimes(2);

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // Check Printed Ballots Count
  getAllByTextWithMarkup('Ballots Printed: 2');

  // ---------------

  // Voter 3 Prints Ballot
  card.insertCard(
    makeVoterCard(electionSample),
    encodeBallot(election, {
      electionHash,
      ballotId: unsafeParse(BallotIdSchema, 'test-ballot-id'),
      ballotStyleId: election.ballotStyles[0].id,
      precinctId: election.precincts[0].id,
      votes: sampleVotes3,
      isTestMode: true,
      ballotType: BallotType.Standard,
    })
  );

  // Show Printing Ballot screen
  await advanceTimersAndPromises();
  screen.getByText('Printing your official ballot');

  // After timeout, show Verify and Scan Instructions
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);
  screen.getByText('Verify and Scan Your Official Ballot');
  expect(printer.print).toHaveBeenCalledTimes(3);

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // Check Printed Ballots Count
  getAllByTextWithMarkup('Ballots Printed: 3');

  // Blank Ballot, i.e. a ballot that deliberately is left empty by the voter, should still print
  card.insertCard(
    makeVoterCard(electionSample),
    encodeBallot(election, {
      electionHash,
      ballotId: unsafeParse(BallotIdSchema, 'test-ballot-id'),
      ballotStyleId: election.ballotStyles[0].id,
      precinctId: election.precincts[0].id,
      votes: {},
      isTestMode: true,
      ballotType: BallotType.Standard,
    })
  );

  // Show Printing Ballot screen
  await advanceTimersAndPromises();
  screen.getByText('Printing your official ballot');

  expect(getAllByTextWithMarkup('[no selection]')).toHaveLength(20);

  // After timeout, show Verify and Scan Instructions
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);
  screen.getByText('Verify and Scan Your Official Ballot');
  expect(printer.print).toHaveBeenCalledTimes(4);

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Card');

  // Check Printed Ballots Count
  getAllByTextWithMarkup('Ballots Printed: 4');

  // ---------------

  // Pollworker Closes Polls
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  screen.getByText('Close Polls for Center Springfield');

  // Close Polls
  fireEvent.click(screen.getByText('Close Polls for Center Springfield'));
  screen.getByText('Open Polls for Center Springfield');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Unconfigure with Admin Card
  card.insertCard(adminCard, electionData);
  await advanceTimersAndPromises();
  screen.getByText('Election definition is loaded.');
  fireEvent.click(screen.getByText('Unconfigure Machine'));
  await advanceTimersAndPromises();

  // Default Unconfigured
  screen.getByText('Device Not Configured');
});

test('PrintOnly retains app mode when unconfigured', async () => {
  const { electionData, electionHash } = electionSampleDefinition;
  const card = new MemoryCard();
  const adminCard = makeAdminCard(electionHash);
  const pollWorkerCard = makePollWorkerCard(electionHash);
  const printer = fakePrinter();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider({ appMode: PrintOnly });
  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      printer={printer}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );

  await advanceTimersAndPromises();

  async function configure(): Promise<void> {
    // Configure with Admin Card
    card.insertCard(adminCard, electionData);
    await advanceTimersAndPromises();
    fireEvent.click(screen.getByText('Load Election Definition'));

    await advanceTimersAndPromises();
    screen.getByText('Election definition is loaded.');

    // Select precinct
    screen.getByText('State of Hamilton');
    const precinctSelect = screen.getByLabelText('Precinct');
    const precinctId = (within(precinctSelect).getByText(
      'Center Springfield'
    ) as HTMLOptionElement).value;
    fireEvent.change(precinctSelect, { target: { value: precinctId } });
    within(screen.getByTestId('election-info')).getByText('Center Springfield');

    // Remove card
    card.removeCard();
    await advanceTimersAndPromises();
    screen.getByText('Polls Closed');
    screen.getByText('Insert Poll Worker card to open.');
  }

  // Open Polls with Poll Worker Card
  async function openPolls(): Promise<void> {
    card.insertCard(pollWorkerCard);
    await advanceTimersAndPromises();
    fireEvent.click(screen.getByText('Open Polls for Center Springfield'));
    screen.getByText('Close Polls for Center Springfield');

    // Remove card
    card.removeCard();
    await advanceTimersAndPromises();
  }

  async function unconfigure(): Promise<void> {
    // Unconfigure with Admin Card
    card.insertCard(adminCard, electionData);
    await advanceTimersAndPromises();
    screen.getByText('Election definition is loaded.');
    fireEvent.click(screen.getByText('Unconfigure Machine'));
    await advanceTimersAndPromises();

    // Default Unconfigured
    screen.getByText('Device Not Configured');

    // Remove card
    card.removeCard();
    await advanceTimersAndPromises();
  }

  // ---------------

  // Default Unconfigured
  screen.getByText('Device Not Configured');

  // Do the initial configuration & open polls.
  await configure();
  await openPolls();

  // Make sure we're ready to print ballots.
  screen.getByText('Insert Card to print your official ballot.');

  // Remove election configuration.
  await unconfigure();

  // Re-configure & open polls again.
  await configure();
  await openPolls();

  // Make sure we're again ready to print ballots.
  screen.getByText('Insert Card to print your official ballot.');
});

test('PrintOnly prompts to change to live mode on election day', async () => {
  const electionDefinition = asElectionDefinition({
    ...electionSampleDefinition.election,
    date: new Date().toISOString(),
  });
  const adminCard = makeAdminCard(electionDefinition.electionHash);
  const pollWorkerCard = makePollWorkerCard(electionDefinition.electionHash);
  const card = new MemoryCard();
  const printer = fakePrinter();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider({ appMode: PrintOnly });
  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      printer={printer}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  // Default Unconfigured
  screen.getByText('Device Not Configured');

  // ---------------

  // Configure with Admin Card
  card.insertCard(adminCard, electionDefinition.electionData);
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText('Load Election Definition'));

  await advanceTimersAndPromises();
  screen.getByText('Election definition is loaded.');
  screen.getByLabelText('Precinct');

  // Select precinct
  screen.getByText('State of Hamilton');
  const precinctSelect = screen.getByLabelText('Precinct');
  const precinctId = (within(precinctSelect).getByText(
    'Center Springfield'
  ) as HTMLOptionElement).value;
  fireEvent.change(precinctSelect, { target: { value: precinctId } });
  within(screen.getByTestId('election-info')).getByText('Center Springfield');

  // Remove card
  card.removeCard();
  await advanceTimersAndPromises();
  screen.getByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Switch to Live Election Mode with the Poll Worker Card.
  card.insertCard(pollWorkerCard);
  await advanceTimersAndPromises();
  screen.getByText(
    'Switch to Live Election Mode and reset the tally of printed ballots?'
  );
  fireEvent.click(screen.getByText('Switch to Live Mode'));
});
