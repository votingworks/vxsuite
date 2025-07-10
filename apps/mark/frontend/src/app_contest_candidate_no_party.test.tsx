import { afterEach, beforeEach, expect, test } from 'vitest';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import { BallotStyleId, CandidateContest, Election } from '@votingworks/types';
import {
  asElectionDefinition,
  readElectionGeneral,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { App } from './app';

import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

const election = readElectionGeneral();
const electionWithNoPartyCandidateContests: Election = {
  ...election,
  contests: election.contests.map((contest) => {
    if (contest.type === 'candidate') {
      const noPartyCandidateContest: CandidateContest = {
        ...contest,
        candidates: contest.candidates.map((candidate) => ({
          ...candidate,
          partyIds: undefined,
        })),
      };
      return noPartyCandidateContest;
    }

    return contest;
  }),
};

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(
    asElectionDefinition(electionWithNoPartyCandidateContests)
  );
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Single Seat Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
  });

  // Go to First Contest
  userEvent.click(await screen.findByText('Start Voting'));

  // ====================== END CONTEST SETUP ====================== //

  expect(screen.queryByText('Federalist')).toEqual(null);
  expect(screen.queryByText('Labor')).toEqual(null);
  expect(screen.queryByText("People's")).toEqual(null);
  expect(screen.queryByText('Liberty')).toEqual(null);
  expect(screen.queryByText('Constitution')).toEqual(null);
  expect(screen.queryByText('Whig')).toEqual(null);
});
