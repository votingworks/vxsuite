import { mockOf } from '@votingworks/test-utils';
import { ALL_PRECINCTS_SELECTION, MemoryHardware } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { ContestPage, ContestPageProps } from '@votingworks/mark-flow-ui';
import { ContestId, OptionalVote, VotesDict } from '@votingworks/types';
import { useHistory } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../test/react_testing_library';
import { App } from './app';

import {
  advanceTimers,
  advanceTimersAndPromises,
} from '../test/helpers/timers';

import { singleSeatContestWithWriteIn } from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { PrintPage } from './pages/print_page';
import {
  MOCK_PRINT_PAGE_TEST_ID,
  MockPrintPage,
} from '../test/helpers/mock_print_page';

let apiMock: ApiMock;

jest.mock(
  '@votingworks/mark-flow-ui',
  (): typeof import('@votingworks/mark-flow-ui') => ({
    ...jest.requireActual('@votingworks/mark-flow-ui'),
    ContestPage: jest.fn(),
  })
);

jest.mock('./pages/print_page', (): typeof import('./pages/print_page') => ({
  ...jest.requireActual('./pages/print_page'),
  PrintPage: jest.fn(),
}));

/**
 * Mocks the mark-flow-ui {@link ContestPage} to avoid re-testing the write-in
 * modal, which is already covered in mark-flow-ui.
 * This allows us to just test the glue code for handling write-in vote updates.
 */
function setUpMockContestPage() {
  let fireUpdateVoteEvent: ContestPageProps['updateVote'];
  let routerHistory: ReturnType<typeof useHistory>;
  let latestVotes: VotesDict;

  mockOf(ContestPage)
    .mockReset()
    .mockImplementation((props: ContestPageProps) => {
      const { updateVote, votes } = props;
      routerHistory = useHistory();

      fireUpdateVoteEvent = updateVote;
      latestVotes = votes;

      return <div data-testid="MockMarkFlowUiContestPage" />;
    });

  return {
    fireUpdateVoteEvent: (contestId: ContestId, vote: OptionalVote) =>
      act(() => fireUpdateVoteEvent(contestId, vote)),
    getLatestVotes: () => latestVotes,
    goToReviewPage: () => {
      routerHistory.location.pathname = '/review';
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
  setUpMockContestPage();

  mockOf(PrintPage).mockImplementation(MockPrintPage);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

it('Single Seat Contest with Write In', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const hardware = MemoryHardware.buildStandard();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
    isTestMode: false,
  });

  const { fireUpdateVoteEvent, getLatestVotes, goToReviewPage } =
    setUpMockContestPage();

  render(
    <App
      hardware={hardware}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });

  // Go to First Contest
  userEvent.click(await screen.findByText('Start Voting'));
  advanceTimers();

  // ====================== END CONTEST SETUP ====================== //

  // Verify write-in votes are round-tripped to/from mark-flow-ui ContestPage
  fireUpdateVoteEvent(singleSeatContestWithWriteIn.id, [
    { id: 'write-in', name: 'BOB', isWriteIn: true, writeInIndex: 0 },
  ]);
  expect(getLatestVotes()).toEqual({
    [singleSeatContestWithWriteIn.id]: [
      { id: 'write-in', name: 'BOB', isWriteIn: true, writeInIndex: 0 },
    ],
  });

  fireUpdateVoteEvent(singleSeatContestWithWriteIn.id, []);
  expect(getLatestVotes()).toEqual({ [singleSeatContestWithWriteIn.id]: [] });

  fireUpdateVoteEvent(singleSeatContestWithWriteIn.id, [
    { id: 'write-in', name: 'SAL', isWriteIn: true, writeInIndex: 0 },
  ]);
  expect(getLatestVotes()).toEqual({
    [singleSeatContestWithWriteIn.id]: [
      { id: 'write-in', name: 'SAL', isWriteIn: true, writeInIndex: 0 },
    ],
  });

  // Go to review page and confirm write in exists
  act(() => goToReviewPage());

  // Review Screen
  await screen.findByText('Review Your Votes');
  expect(screen.getByText('SAL')).toBeTruthy();
  expect(screen.getByText(/\(write-in\)/)).toBeTruthy();

  // Print Screen
  apiMock.expectIncrementBallotsPrintedCount();
  apiMock.expectGetElectionState();
  fireEvent.click(screen.getByText(/Print My ballot/i));
  advanceTimers();
  screen.getByTestId(MOCK_PRINT_PAGE_TEST_ID);
});
