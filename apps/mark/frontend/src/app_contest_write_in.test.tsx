import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { ContestPage, ContestPageProps } from '@votingworks/mark-flow-ui';
import {
  BallotStyleId,
  ContestId,
  OptionalVote,
  VotesDict,
} from '@votingworks/types';
import { useHistory } from 'react-router-dom';
import { act, fireEvent, render, screen } from '../test/react_testing_library';
import { App } from './app';

import {
  advanceTimers,
  advanceTimersAndPromises,
} from '../test/helpers/timers';

import { singleSeatContestWithWriteIn } from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

vi.mock(import('@votingworks/mark-flow-ui'), async (importActual) => ({
  ...(await importActual()),
  ContestPage: vi.fn(),
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

  vi.mocked(ContestPage)
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
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
  setUpMockContestPage();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Single Seat Contest with Write In', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(readElectionGeneralDefinition());
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
    isTestMode: false,
  });

  const { fireUpdateVoteEvent, getLatestVotes, goToReviewPage } =
    setUpMockContestPage();

  const app = <App apiClient={apiMock.mockApiClient} />;
  const { rerender } = render(app);
  await advanceTimersAndPromises();

  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
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
  rerender(app); // no component change so we need to force a rerender

  // Review Screen
  await screen.findByText('Review Your Votes');
  // Expect one instance rendered for display and one for audio:
  expect(screen.getAllByText('SAL')).toHaveLength(2);
  screen.getByText(/\(write-in\)/);

  // Print Screen
  apiMock.expectPrintBallot({
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
    votes: {
      [singleSeatContestWithWriteIn.id]: [
        {
          id: 'write-in',
          isWriteIn: true,
          name: 'SAL',
          writeInIndex: 0,
        },
      ],
    },
  });
  apiMock.expectGetElectionState();
  fireEvent.click(screen.getByText(/Print My ballot/i));
  advanceTimers();
  screen.getByText(/Printing Your Official Ballot/i);
});
