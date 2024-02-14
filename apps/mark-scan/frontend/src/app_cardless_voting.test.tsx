import {
  MemoryHardware,
  singlePrecinctSelectionFor,
  ALL_PRECINCTS_SELECTION,
} from '@votingworks/utils';
import {
  FakeKiosk,
  expectPrintToPdf,
  fakeKiosk,
  fakePrintElement,
  fakePrintElementWhenReady,
  fakePrintElementToPdf,
} from '@votingworks/test-utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
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

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => ({
  ...jest.requireActual('@votingworks/ui'),
  printElementWhenReady: fakePrintElementWhenReady,
  printElement: fakePrintElement,
  printElementToPdf: fakePrintElementToPdf,
}));

let apiMock: ApiMock;
let kiosk: FakeKiosk;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  kiosk = fakeKiosk();
  window.kiosk = kiosk;
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
  const hardware = MemoryHardware.buildStandard();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: CENTER_SPRINGFIELD_PRECINCT_SELECTION,
    pollsState: 'polls_open',
  });
  render(
    <App
      hardware={hardware}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );
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

  await screen.findByText('Load Blank Ballot Sheet');
  mockLoadPaper();

  // Poll Worker deactivates ballot style
  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  const deactivateButton = await screen.findByText('Deactivate Voting Session');
  userEvent.click(deactivateButton);
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
  await screen.findByText('Voting Session in Progress');

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
  await screen.findByText('Voting Session Active: 12 at Center Springfield');

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
  apiMock.expectPrintBallot();
  apiMock.expectGetElectionState({
    ballotsPrintedCount: 1,
  });
  fireEvent.click(screen.getByText(/Print My ballot/i));
  screen.getByText(/Printing Your Official Ballot/i);
  await expectPrintToPdf();

  // Validate ballot page
  const mockInterpretation = getMockInterpretation(electionDefinition);
  apiMock.expectGetInterpretation(mockInterpretation);
  apiMock.setPaperHandlerState('presenting_ballot');
  await screen.findByText('Review Your Votes');
  apiMock.expectValidateBallot();
  apiMock.expectGetInterpretation(mockInterpretation);
  userEvent.click(screen.getByText('My Ballot is Correct'));

  apiMock.setPaperHandlerState('ejecting_to_rear');
  await screen.findByText('Casting Ballot...');

  apiMock.setAuthStatusLoggedOut();
  apiMock.setPaperHandlerState('not_accepting_paper');
  await screen.findByText('Insert Card');
});

test('in "All Precincts" mode, poll worker must select a precinct first', async () => {
  const electionDefinition = electionGeneralDefinition;
  const hardware = MemoryHardware.buildStandard();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });
  render(
    <App
      hardware={hardware}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );

  await screen.findByText('Insert Card');

  // ---------------
  // Activate Voter Session for Cardless Voter
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('1. Select Voter’s Precinct');
  fireEvent.click(
    within(screen.getByTestId('precincts')).getByText('Center Springfield')
  );

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

  await screen.findByText('Load Blank Ballot Sheet');
});
