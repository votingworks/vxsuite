import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryStorage, MemoryHardware } from '@votingworks/utils';

import { CandidateContest, Election } from '@votingworks/types';
import {
  asElectionDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { setStateInStorage } from '../test/helpers/election';
import { electionStorageKey } from './app_root';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

const { election } = electionSampleDefinition;
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
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

it('Single Seat Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  await storage.set(
    electionStorageKey,
    asElectionDefinition(electionWithNoPartyCandidateContests)
  );
  await setStateInStorage(storage);

  const { container } = render(
    <App
      hardware={hardware}
      storage={storage}
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
  await advanceTimersAndPromises();

  // ====================== END CONTEST SETUP ====================== //

  expect(screen.queryByText('Federalist')).toEqual(null);
  expect(screen.queryByText('Labor')).toEqual(null);
  expect(screen.queryByText("People's")).toEqual(null);
  expect(screen.queryByText('Liberty')).toEqual(null);
  expect(screen.queryByText('Constitution')).toEqual(null);
  expect(screen.queryByText('Whig')).toEqual(null);

  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot();
});
