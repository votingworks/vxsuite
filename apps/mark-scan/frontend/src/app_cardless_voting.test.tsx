import {
  singlePrecinctSelectionFor,
  ALL_PRECINCTS_SELECTION,
} from '@votingworks/utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { LanguageCode } from '@votingworks/types';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import {
  fireEvent,
  render,
  screen,
  within,
} from '../test/react_testing_library';

import { App } from './app';

import { presidentContest, voterContests } from '../test/helpers/election';
import { withMarkup } from '../test/helpers/with_markup';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { getMockInterpretation } from '../test/helpers/interpretation';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.setPaperHandlerState('not_accepting_paper');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(30000);

function mockLoadPaper() {
  apiMock.setPaperHandlerState('waiting_for_ballot_data');
}

async function awaitRenderAndClickBallotStyle(): Promise<void> {
  const ballotStylesElement = await screen.findByTestId('ballot-styles');
  fireEvent.click(within(ballotStylesElement).getByText('12'));
}

const CENTER_SPRINGFIELD_PRECINCT_SELECTION = singlePrecinctSelectionFor('23');

test('Cardless Voting Flow', async () => {
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
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
  await screen.findByText('Select Voter’s Ballot Style');
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12', precinctId: '23' })
    .resolves();
  apiMock.expectSetAcceptingPaperState();
  await awaitRenderAndClickBallotStyle();
  apiMock.setPaperHandlerState('accepting_paper');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  screen.getByText(/(12)/);

  await screen.findByText('Load Ballot Sheet');
  screen.getButton('Start a New Voting Session');
  mockLoadPaper();

  // Poll Worker cancels
  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  const cancelButton = await screen.findByText('Cancel Voting Session');
  userEvent.click(cancelButton);
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('Select Voter’s Ballot Style');

  // Poll Worker reactivates ballot style
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12', precinctId: '23' })
    .resolves();
  apiMock.expectSetAcceptingPaperState();
  await awaitRenderAndClickBallotStyle();
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  mockLoadPaper();

  // Poll Worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });

  // Voter Ballot Style is active
  await findByTextWithMarkup('Number of contests on your ballot: 20');
  screen.getByText(/(12)/);
  fireEvent.click(screen.getByText('Start Voting'));

  // Voter votes in first contest
  fireEvent.click(await screen.findByText(presidentContest.candidates[0].name));
  fireEvent.click(screen.getByText('Next'));

  // Poll Worker inserts card and sees message that there are votes
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  await screen.findByText('Voting Session Paused');

  // Poll Worker resets ballot to remove votes
  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  fireEvent.click(screen.getByText('Reset Ballot'));
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  // Back on Poll Worker screen
  await screen.findByText('Select Voter’s Ballot Style');

  // Activates Ballot Style again
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12', precinctId: '23' })
    .resolves();
  apiMock.expectSetAcceptingPaperState();
  await awaitRenderAndClickBallotStyle();
  mockLoadPaper();
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  await screen.findByText('Remove Card to Begin Voting Session');
  screen.getByText(hasTextAcrossElements(/Precinct: Center Springfield/));
  screen.getByText(hasTextAcrossElements(/Ballot Style: 12/));

  // Poll Worker removes their card
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });

  // Voter Ballot Style is active
  await findByTextWithMarkup('Number of contests on your ballot: 20');
  screen.getByText(/(12)/);
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
    languageCode: LanguageCode.ENGLISH,
    precinctId: '23',
    ballotStyleId: '12',
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

test('in "All Precincts" mode, poll worker must select a precinct first', async () => {
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });
  render(<App apiClient={apiMock.mockApiClient} />);

  await screen.findByText('Insert Card');

  // ---------------
  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('1. Select Voter’s Precinct');
  userEvent.click(screen.getByText('Select a precinct…'));
  userEvent.click(screen.getByText('Center Springfield'));

  screen.getByText('2. Select Voter’s Ballot Style');
  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({ ballotStyleId: '12', precinctId: '23' })
    .resolves();
  apiMock.expectSetAcceptingPaperState();
  await awaitRenderAndClickBallotStyle();
  apiMock.setPaperHandlerState('accepting_paper');

  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: '12',
      precinctId: '23',
    },
  });
  screen.getByText(/(12)/);

  await screen.findByText('Load Ballot Sheet');
});
