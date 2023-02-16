import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryStorage, MemoryHardware } from '@votingworks/utils';
import { expectPrint } from '@votingworks/test-utils';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import * as GLOBALS from './config/globals';

import { App } from './app';

import {
  presidentContest,
  setElectionInStorage,
  setStateInStorage,
  voterContests,
} from '../test/helpers/election';

import { withMarkup } from '../test/helpers/with_markup';

import { advanceTimersAndPromises } from '../test/helpers/timers';

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

jest.setTimeout(15000);

test('Cardless Voting Flow', async () => {
  const electionDefinition = electionSampleDefinition;
  const { electionHash } = electionDefinition;
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();
  render(
    <App
      hardware={hardware}
      apiClient={apiMock.mockApiClient}
      storage={storage}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();
  const getByTextWithMarkup = withMarkup(screen.getByText);
  const findByTextWithMarkup = withMarkup(screen.findByText);

  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();

  // Default Unconfigured
  screen.getByText('VxMark is Not Configured');

  // ---------------

  // Configure with Election Manager Card
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: undefined })
    .resolves(ok(electionDefinition));
  userEvent.click(await screen.findByText('Load Election Definition'));

  await advanceTimersAndPromises();
  screen.getByText('Election Definition is loaded.');
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
  within(screen.getByTestId('electionInfoBar')).getByText(/Center Springfield/);

  fireEvent.click(screen.getByText('Live Election Mode'));
  expect(
    screen.getByText<HTMLButtonElement>('Live Election Mode').disabled
  ).toBeTruthy();

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Open Polls with Poll Worker Card
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  userEvent.click(await screen.findByText('Open Polls'));
  fireEvent.click(screen.getByText('Open Polls on VxMark Now'));

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('Insert Card');

  // ---------------

  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  await screen.findByText('Select Voter’s Ballot Style');
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ electionHash, ballotStyleId: '12', precinctId: '23' })
    .resolves();
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  screen.getByText(/(12)/);

  // Poll Worker deactivates ballot style
  apiMock.mockApiClient.endCardlessVoterSession
    .expectCallWith({ electionHash })
    .resolves();
  userEvent.click(await screen.findByText('Deactivate Voting Session'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
  });
  await screen.findByText('Select Voter’s Ballot Style');

  // Poll Worker reactivates ballot style
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ electionHash, ballotStyleId: '12', precinctId: '23' })
    .resolves();
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });

  // Poll Worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });
  await advanceTimersAndPromises();

  // Voter Ballot Style is active
  screen.getByText(/(12)/);
  getByTextWithMarkup('Your ballot has 20 contests.');
  fireEvent.click(screen.getByText('Start Voting'));

  // Voter votes in first contest
  fireEvent.click(screen.getByText(presidentContest.candidates[0].name));
  fireEvent.click(screen.getByText('Next'));

  // Poll Worker inserts card and sees message that there are votes
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  await advanceTimersAndPromises();
  await screen.findByText('Ballot Contains Votes');

  // Poll Worker resets ballot to remove votes
  apiMock.mockApiClient.endCardlessVoterSession
    .expectCallWith({ electionHash })
    .resolves();
  fireEvent.click(screen.getByText('Reset Ballot'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
  });

  // Back on Poll Worker screen
  await screen.findByText('Select Voter’s Ballot Style');

  // Activates Ballot Style again
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ electionHash, ballotStyleId: '12', precinctId: '23' })
    .resolves();
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  await screen.findByText('Voting Session Active: 12 at Center Springfield');

  // Poll Worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });
  await advanceTimersAndPromises();

  // Voter Ballot Style is active
  screen.getByText(/(12)/);
  await findByTextWithMarkup('Your ballot has 20 contests.');
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
  screen.getByText('Printing Your Official Ballot');
  await expectPrint();

  // Reset ballot
  await advanceTimersAndPromises();

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);

  // Reset Ballot is called
  // Show Verify and Scan Instructions
  screen.getByText('You’re Almost Done');
  expect(
    screen.queryByText('3. Return the card to a poll worker.')
  ).toBeFalsy();

  // Wait for timeout to return to Insert Card screen
  apiMock.mockApiClient.endCardlessVoterSession
    .expectCallWith({ electionHash })
    .resolves();
  await advanceTimersAndPromises(GLOBALS.BALLOT_INSTRUCTIONS_TIMEOUT_SECONDS);
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
});

test('Another Voter submits blank ballot and clicks Done', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const electionDefinition = electionSampleDefinition;
  const { electionHash } = electionDefinition;
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  await setElectionInStorage(storage, electionSampleDefinition);
  await setStateInStorage(storage);

  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  const getByTextWithMarkup = withMarkup(screen.getByText);
  const findByTextWithMarkup = withMarkup(screen.findByText);

  // ====================== END CONTEST SETUP ====================== //

  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ electionHash, ballotStyleId: '12', precinctId: '23' })
    .resolves();
  userEvent.click(
    within(await screen.findByTestId('ballot-styles')).getByText('12')
  );
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  await screen.findByText('Voting Session Active: 12 at Center Springfield');

  // Poll Worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });
  await advanceTimersAndPromises();

  // Voter Ballot Style is active
  screen.getByText(/(12)/);
  await findByTextWithMarkup('Your ballot has 20 contests.');
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
  screen.getByText('Printing Your Official Ballot');
  await expectPrint();

  // Reset ballot
  await advanceTimersAndPromises();

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);

  // Reset Ballot is called
  // Show Verify and Scan Instructions
  screen.getByText('You’re Almost Done');
  expect(screen.queryByText('3. Return the card.')).toBeFalsy();

  // Click "Done" to get back to Insert Card screen
  apiMock.mockApiClient.endCardlessVoterSession
    .expectCallWith({ electionHash })
    .resolves();
  fireEvent.click(screen.getByText('Done'));
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
});

test('poll worker must select a precinct first', async () => {
  const electionDefinition = electionSampleDefinition;
  const { electionHash } = electionDefinition;
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();
  render(
    <App
      hardware={hardware}
      apiClient={apiMock.mockApiClient}
      storage={storage}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();
  const getByTextWithMarkup = withMarkup(screen.getByText);
  const findByTextWithMarkup = withMarkup(screen.findByText);

  await advanceTimersAndPromises();

  // Default Unconfigured
  screen.getByText('VxMark is Not Configured');

  // ---------------

  // Configure with Election Manager Card
  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: undefined })
    .resolves(ok(electionDefinition));
  userEvent.click(await screen.findByText('Load Election Definition'));

  await advanceTimersAndPromises();
  screen.getByText('Election Definition is loaded.');
  screen.getByLabelText('Precinct');
  screen.queryByText(`Election ID: ${electionHash.slice(0, 10)}`);

  // Select precinct
  screen.getByText('State of Hamilton');
  const precinctSelect = screen.getByLabelText('Precinct');
  const precinctId =
    within(precinctSelect).getByText<HTMLOptionElement>('All Precincts').value;
  fireEvent.change(precinctSelect, { target: { value: precinctId } });
  within(screen.getByTestId('electionInfoBar')).getByText(/All Precincts/);

  fireEvent.click(screen.getByText('Live Election Mode'));
  expect(
    screen.getByText<HTMLButtonElement>('Live Election Mode').disabled
  ).toBeTruthy();

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('Polls Closed');
  screen.getByText('Insert Poll Worker card to open.');

  // ---------------

  // Open Polls with Poll Worker Card
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  userEvent.click(await screen.findByText('Open Polls'));
  fireEvent.click(screen.getByText('Open Polls on VxMark Now'));

  // Remove card
  apiMock.setAuthStatusLoggedOut();
  await advanceTimersAndPromises();
  await screen.findByText('Insert Card');

  // ---------------

  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  await screen.findByText('1. Select Voter’s Precinct');
  fireEvent.click(
    within(screen.getByTestId('precincts')).getByText('Center Springfield')
  );
  screen.getByText('2. Select Voter’s Ballot Style');
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ electionHash, ballotStyleId: '12', precinctId: '23' })
    .resolves();
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  await screen.findByText('Voting Session Active: 12 at Center Springfield');

  // Poll Worker deactivates ballot style
  apiMock.mockApiClient.endCardlessVoterSession
    .expectCallWith({ electionHash })
    .resolves();
  fireEvent.click(screen.getByText('Deactivate Voting Session'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
  });
  await screen.findByText('2. Select Voter’s Ballot Style');

  // Poll Worker reactivates ballot style
  fireEvent.click(
    within(screen.getByTestId('precincts')).getByText('Center Springfield')
  );
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ electionHash, ballotStyleId: '12', precinctId: '23' })
    .resolves();
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });

  // Poll Worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });
  await advanceTimersAndPromises();

  // Voter Ballot Style is active
  screen.getByText(/(12)/);
  getByTextWithMarkup('Your ballot has 20 contests.');
  fireEvent.click(screen.getByText('Start Voting'));

  // Voter votes in first contest
  fireEvent.click(screen.getByText(presidentContest.candidates[0].name));
  fireEvent.click(screen.getByText('Next'));

  // Poll Worker inserts card and sees message that there are votes
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  await advanceTimersAndPromises();
  await screen.findByText('Ballot Contains Votes');

  // Poll Worker resets ballot to remove votes
  apiMock.mockApiClient.endCardlessVoterSession
    .expectCallWith({ electionHash })
    .resolves();
  fireEvent.click(screen.getByText('Reset Ballot'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
  });

  // Back on Poll Worker screen
  await screen.findByText('1. Select Voter’s Precinct');

  // Activates Ballot Style again
  fireEvent.click(
    within(screen.getByTestId('precincts')).getByText('Center Springfield')
  );
  screen.getByText('2. Select Voter’s Ballot Style');
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ electionHash, ballotStyleId: '12', precinctId: '23' })
    .resolves();
  fireEvent.click(within(screen.getByTestId('ballot-styles')).getByText('12'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    isScannerReportDataReadExpected: false,
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  await screen.findByText('Voting Session Active: 12 at Center Springfield');

  // Poll Worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });
  await advanceTimersAndPromises();

  // Voter Ballot Style is active
  screen.getByText(/(12)/);
  await findByTextWithMarkup('Your ballot has 20 contests.');
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
  screen.getByText('Printing Your Official Ballot');
  await expectPrint();

  // Reset ballot
  await advanceTimersAndPromises();

  // Expire timeout for display of "Printing Ballot" screen
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);

  // Reset Ballot is called
  // Show Verify and Scan Instructions
  screen.getByText('You’re Almost Done');
  expect(
    screen.queryByText('3. Return the card to a poll worker.')
  ).toBeFalsy();

  // Wait for timeout to return to Insert Card screen
  apiMock.mockApiClient.endCardlessVoterSession
    .expectCallWith({ electionHash })
    .resolves();
  await advanceTimersAndPromises(GLOBALS.BALLOT_INSTRUCTIONS_TIMEOUT_SECONDS);
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
});
