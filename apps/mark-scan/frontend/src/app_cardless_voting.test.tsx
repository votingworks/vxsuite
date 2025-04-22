import { afterEach, beforeEach, test, vi } from 'vitest';
import {
  singlePrecinctSelectionFor,
  ALL_PRECINCTS_SELECTION,
} from '@votingworks/utils';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { BallotStyleId } from '@votingworks/types';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { fireEvent, render, screen } from '../test/react_testing_library';

import { App } from './app';

import { presidentContest, voterContests } from '../test/helpers/election';
import { withMarkup } from '../test/helpers/with_markup';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { getMockInterpretation } from '../test/helpers/interpretation';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.setPaperHandlerState('not_accepting_paper');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

vi.setConfig({
  testTimeout: 30_000,
});

function mockLoadPaper() {
  apiMock.setPaperHandlerState('waiting_for_ballot_data');
}

const CENTER_SPRINGFIELD_PRECINCT_SELECTION = singlePrecinctSelectionFor('23');

test('Cardless Voting Flow', async () => {
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

  await screen.findByText('Insert Card');

  // ---------------

  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('Start a New Voting Session');

  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12' as BallotStyleId, precinctId: '23' })
    .resolves();
  apiMock.expectSetAcceptingPaperState();
  userEvent.click(
    screen.getByText(
      hasTextAcrossElements('Start Voting Session: Center Springfield')
    )
  );

  apiMock.setPaperHandlerState('accepting_paper');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12' as BallotStyleId,
      precinctId: '23',
    },
  });
  await screen.findByText('Load Ballot Sheet');
  screen.getButton('Start a New Voting Session');
  mockLoadPaper();

  // Poll worker cancels
  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  const cancelButton = await screen.findByText('Cancel Voting Session');
  userEvent.click(cancelButton);
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('Start a New Voting Session');

  // Poll worker reactivates ballot style
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12' as BallotStyleId, precinctId: '23' })
    .resolves();
  apiMock.expectSetAcceptingPaperState();
  userEvent.click(
    screen.getByText(
      hasTextAcrossElements('Start Voting Session: Center Springfield')
    )
  );

  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12' as BallotStyleId,
      precinctId: '23',
    },
  });
  mockLoadPaper();

  // Poll worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
  });

  // Voter Ballot Style is active
  await findByTextWithMarkup('Number of contests on your ballot: 20');
  screen.getByText('Center Springfield');
  fireEvent.click(screen.getByText('Start Voting'));

  // Voter votes in first contest
  fireEvent.click(await screen.findByText(presidentContest.candidates[0].name));
  fireEvent.click(screen.getByText('Next'));

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
  fireEvent.click(screen.getByText('Reset Ballot'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  // Back on poll worker screen
  await screen.findByText('Start a New Voting Session');

  // Activates Ballot Style again
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12' as BallotStyleId, precinctId: '23' })
    .resolves();
  apiMock.expectSetAcceptingPaperState();
  userEvent.click(
    screen.getByText(
      hasTextAcrossElements('Start Voting Session: Center Springfield')
    )
  );

  mockLoadPaper();
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12' as BallotStyleId,
      precinctId: '23',
    },
  });
  await screen.findByText('Remove Card to Begin Voting Session');
  screen.getByText(hasTextAcrossElements(/Precinct: Center Springfield/));

  // Poll worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
  });

  // Voter Ballot Style is active
  await findByTextWithMarkup('Number of contests on your ballot: 20');
  screen.getByText('Center Springfield');
  fireEvent.click(screen.getByText('Start Voting'));

  // Voter makes selection in first contest and then advances to review screen
  for (let i = 0; i < voterContests.length; i += 1) {
    const { title } = voterContests[i];

    await screen.findByRole('heading', { name: title });

    // Vote for a candidate contest
    if (title === presidentContest.title) {
      fireEvent.click(screen.getByText(presidentContest.candidates[0].name));
    }
    fireEvent.click(screen.getByText('Next'));
  }

  // Advance to print ballot
  apiMock.expectPrintBallot({
    languageCode: 'en',
    precinctId: '23',
    ballotStyleId: '12' as BallotStyleId,
    votes: {
      president: [presidentContest.candidates[0]],
    },
  });
  apiMock.expectGetElectionState({
    ballotsPrintedCount: 1,
  });
  fireEvent.click(screen.getByText(/Print My ballot/i));
  screen.getByText(/Printing Your Official Ballot/i);

  // Validate ballot page
  const mockInterpretation = getMockInterpretation(electionDefinition);
  apiMock.expectGetInterpretation(mockInterpretation);
  apiMock.setPaperHandlerState('presenting_ballot');
  await screen.findByText('Review Your Votes');
  apiMock.expectValidateBallot();
  apiMock.expectGetInterpretation(mockInterpretation);
  userEvent.click(screen.getByText('Cast My Ballot'));

  apiMock.setPaperHandlerState('ejecting_to_rear');
  await screen.findByText('Casting Ballot...');

  apiMock.setAuthStatusLoggedOut();
  apiMock.setPaperHandlerState('not_accepting_paper');
  await screen.findByText('Insert Card');
});

test('in "All Precincts" mode, poll worker must select a precinct', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });
  render(<App apiClient={apiMock.mockApiClient} />);

  await screen.findByText('Insert Card');

  // ---------------
  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('Start a New Voting Session');
  userEvent.click(screen.getByText("Select voter's precinct…"));

  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12' as BallotStyleId, precinctId: '23' })
    .resolves();
  apiMock.expectSetAcceptingPaperState();
  userEvent.click(screen.getByText('Center Springfield'));

  apiMock.setPaperHandlerState('accepting_paper');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12' as BallotStyleId,
      precinctId: '23',
    },
  });
  await screen.findByText('Load Ballot Sheet');
});

test('selecting a precinct split', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });
  render(<App apiClient={apiMock.mockApiClient} />);

  await screen.findByText('Insert Card');

  // ---------------
  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('Start a New Voting Session');
  userEvent.click(screen.getByText("Select voter's precinct…"));

  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '5' as BallotStyleId, precinctId: '21' })
    .resolves();
  apiMock.expectSetAcceptingPaperState();
  userEvent.click(screen.getByText('North Springfield - Split 1'));

  apiMock.setPaperHandlerState('accepting_paper');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '5' as BallotStyleId,
      precinctId: '21',
    },
  });

  await screen.findByText('Load Ballot Sheet');
  mockLoadPaper();
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '5' as BallotStyleId,
      precinctId: '21',
    },
  });
  await screen.findByText('Remove Card to Begin Voting Session');
  screen.getByText(
    hasTextAcrossElements(/Precinct: North Springfield - Split 1/)
  );

  // Poll worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '5' as BallotStyleId,
    precinctId: '21',
  });
  // Voter Ballot Style is active
  screen.getByText('North Springfield - Split 1');
});
