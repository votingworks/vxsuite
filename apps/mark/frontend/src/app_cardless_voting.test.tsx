import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { PollingPlace } from '@votingworks/types';
import { find } from '@votingworks/basics';
import { render, screen } from '../test/react_testing_library.js';
import * as GLOBALS from './config/globals.js';

import { App } from './app.js';

import { presidentContest, voterContests } from '../test/helpers/election.js';
import { withMarkup } from '../test/helpers/with_markup.js';
import { advanceTimersAndPromises } from '../test/helpers/timers.js';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client.js';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

vi.setConfig({
  testTimeout: 30000,
});

const precinctId = '23';
const pollingPlaceId = `${precinctId}-polling-place`;
const electionDefinition = readElectionGeneralDefinition();
const { election } = electionDefinition;
const precinct = find(election.precincts, (p) => p.id === precinctId);

test('poll worker selects ballot style, voter votes', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId,
    pollsState: 'polls_open',
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  const findByTextWithMarkup = withMarkup(screen.findByText);

  // ---------------

  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId,
    },
  });
  await screen.findByText('Remove Card to Begin Voting Session');

  // Poll worker deactivates ballot style
  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  userEvent.click(await screen.findByText('Deactivate Voting Session'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('Start a New Voting Session');

  // Poll worker reactivates ballot style
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12', precinctId: '23' })
    .resolves();
  userEvent.click(await screen.findButton(precinct.name));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId,
    },
  });

  // Poll worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId,
  });

  // Voter Ballot Style is active
  await findByTextWithMarkup('Number of contests on your ballot: 20');
  screen.getByText('Center Springfield');
  userEvent.click(screen.getByText('Start Voting'));

  // Voter votes in first contest
  userEvent.click(screen.getByText(presidentContest.candidates[0].name));
  userEvent.click(screen.getByText('Next'));

  // Poll worker inserts card and sees message that there are votes
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId,
    },
  });
  await screen.findByText('Voting Session Paused');

  // Poll worker resets ballot to remove votes
  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  userEvent.click(screen.getByText('Reset Ballot'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  // Back on poll worker screen
  await screen.findByText('Start a New Voting Session');

  // Activates Ballot Style again
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12', precinctId: '23' })
    .resolves();
  userEvent.click(screen.getButton(precinct.name));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId,
    },
  });
  await screen.findByText('Remove Card to Begin Voting Session');

  // Poll worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId,
  });

  // Voter Ballot Style is active
  await findByTextWithMarkup('Number of contests on your ballot: 20');
  screen.getByText('Center Springfield');
  userEvent.click(screen.getByText('Start Voting'));

  // Voter makes selection in first contest and then advances to review screen
  for (let i = 0; i < voterContests.length; i += 1) {
    const { title } = voterContests[i];

    await screen.findByRole('heading', { name: title });

    // Vote for a candidate contest
    if (title === presidentContest.title) {
      userEvent.click(screen.getByText(presidentContest.candidates[0].name));
    }
    userEvent.click(screen.getByText('Next'));
  }

  // Advance to print ballot
  apiMock.expectPrintBallot({
    ballotStyleId: '12',
    precinctId,
    votes: {
      [presidentContest.id]: [presidentContest.candidates[0]],
    },
  });
  apiMock.expectGetElectionState({
    ballotsPrintedCount: 1,
  });
  userEvent.click(screen.getByText(/Print My ballot/i));
  screen.getByText(/Printing Your Ballot/i);

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
  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  await advanceTimersAndPromises(GLOBALS.BALLOT_INSTRUCTIONS_TIMEOUT_SECONDS);
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
});

test('poll worker card insertion during printing does not cause duplicate print', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId,
    pollsState: 'polls_open',
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  const findByTextWithMarkup = withMarkup(screen.findByText);

  // Activate voter session
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: { ballotStyleId: '12', precinctId: '23' },
  });
  await screen.findByText('Remove Card to Begin Voting Session');

  // Poll worker removes card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId,
  });
  await findByTextWithMarkup('Number of contests on your ballot: 20');
  userEvent.click(screen.getByText('Start Voting'));

  // Voter makes a selection and navigates to review
  for (let i = 0; i < voterContests.length; i += 1) {
    const { title } = voterContests[i];
    await screen.findByRole('heading', { name: title });
    if (title === presidentContest.title) {
      userEvent.click(screen.getByText(presidentContest.candidates[0].name));
    }
    userEvent.click(screen.getByText('Next'));
  }

  // Voter clicks print — only one printBallot call should ever be made
  apiMock.expectPrintBallot({
    ballotStyleId: '12',
    precinctId,
    votes: { [presidentContest.id]: [presidentContest.candidates[0]] },
  });
  apiMock.expectGetElectionState({ ballotsPrintedCount: 1 });
  userEvent.click(screen.getByText(/Print My ballot/i));
  await screen.findByText(/Printing Your Ballot/i);

  // Poll worker inserts card while ballot is printing
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: { ballotStyleId: '12', precinctId: '23' },
  });
  await screen.findByText('Voting Session Paused');

  // Poll worker removes card — voter session resumes at the print screen
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId,
  });
  // The print screen is shown again but no second printBallot call is made
  await screen.findByText(/Printing Your Ballot/i);

  // Normal session end after print timeout
  await advanceTimersAndPromises(GLOBALS.BALLOT_PRINTING_TIMEOUT_SECONDS);
  screen.getByText('You’re Almost Done');

  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  await advanceTimersAndPromises(GLOBALS.BALLOT_INSTRUCTIONS_TIMEOUT_SECONDS);
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
});

test('in multi-precinct location, poll worker must select a precinct first', async () => {
  const multiPrecinctLocation: PollingPlace = {
    id: 'multi-precinct-polling-place',
    name: 'Springfield Community Center',
    type: 'election_day',
    precincts: {
      [election.precincts[0].id]: { type: 'whole' },
      [election.precincts[1].id]: { type: 'whole' },
    },
  };

  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord({
    ...electionDefinition,
    election: {
      ...election,
      pollingPlaces: [...(election.pollingPlaces ?? []), multiPrecinctLocation],
    },
  });
  apiMock.expectGetElectionState({
    pollingPlaceId: multiPrecinctLocation.id,
    pollsState: 'polls_open',
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  const findByTextWithMarkup = withMarkup(screen.findByText);

  await screen.findByText('Insert Card');

  // ---------------

  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('Start a New Voting Session');
  userEvent.click(screen.getByText('Select ballot style…'));

  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId,
    },
  });
  await screen.findByText('Remove Card to Begin Voting Session');
  await screen.findByText(
    hasTextAcrossElements('Ballot Style: Center Springfield')
  );

  // Poll worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId,
  });

  // Voter Ballot Style is active
  await findByTextWithMarkup('Number of contests on your ballot: 20');
  screen.getByText('Center Springfield');
  userEvent.click(screen.getByText('Start Voting'));
});
