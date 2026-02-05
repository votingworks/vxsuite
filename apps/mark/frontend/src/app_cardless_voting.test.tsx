import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { BallotStyleId } from '@votingworks/types';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { render, screen } from '../test/react_testing_library';
import * as GLOBALS from './config/globals';

import { App } from './app';

import { presidentContest, voterContests } from '../test/helpers/election';
import { withMarkup } from '../test/helpers/with_markup';
import { advanceTimersAndPromises } from '../test/helpers/timers';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

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

const CENTER_SPRINGFIELD_PRECINCT_SELECTION = singlePrecinctSelectionFor('23');

test('poll worker selects ballot style, voter votes', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: CENTER_SPRINGFIELD_PRECINCT_SELECTION,
    pollsState: 'polls_open',
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  const findByTextWithMarkup = withMarkup(screen.findByText);

  // ---------------

  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12' as BallotStyleId,
      precinctId: '23',
    },
  });
  await screen.findByText('Remove Card to Begin Voting Session');

  // Poll worker deactivates ballot style
  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  userEvent.click(await screen.findByText('Deactivate Voting Session'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('Start Voting Session:');

  // Poll worker reactivates ballot style
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12' as BallotStyleId, precinctId: '23' })
    .resolves();
  userEvent.click(screen.getByText('Start Voting Session:'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12' as BallotStyleId,
      precinctId: '23',
    },
  });

  // Poll worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
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
      ballotStyleId: '12' as BallotStyleId,
      precinctId: '23',
    },
  });
  await screen.findByText('Voting Session Paused');

  // Poll worker resets ballot to remove votes
  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  userEvent.click(screen.getByText('Reset Ballot'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  // Back on poll worker screen
  await screen.findByText('Start Voting Session:');

  // Activates Ballot Style again
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12' as BallotStyleId, precinctId: '23' })
    .resolves();
  userEvent.click(screen.getByText('Start Voting Session:'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12' as BallotStyleId,
      precinctId: '23',
    },
  });
  await screen.findByText('Remove Card to Begin Voting Session');

  // Poll worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
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
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
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

test('in "All Precincts" mode, poll worker must select a precinct first', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  const findByTextWithMarkup = withMarkup(screen.findByText);

  await screen.findByText('Insert Card');

  // ---------------

  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12' as BallotStyleId,
      precinctId: '23',
    },
  });
  await screen.findByText('Remove Card to Begin Voting Session');
  await screen.findByText(
    hasTextAcrossElements('Ballot Style: Center Springfield')
  );

  // Poll worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
  });

  // Voter Ballot Style is active
  await findByTextWithMarkup('Number of contests on your ballot: 20');
  screen.getByText('Center Springfield');
  userEvent.click(screen.getByText('Start Voting'));
});
