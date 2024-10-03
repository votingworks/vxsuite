import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import userEvent from '@testing-library/user-event';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { BallotStyleId } from '@votingworks/types';
import {
  fireEvent,
  render,
  screen,
  within,
} from '../test/react_testing_library';
import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { countyCommissionersContest } from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
  apiMock.setPaperHandlerState('waiting_for_ballot_data');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

it('Single Seat Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} />);
  await advanceTimersAndPromises();

  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
    precinctId: '23',
  });

  // Go to First Contest
  userEvent.click(await screen.findByText('Start Voting'));
  await advanceTimersAndPromises();

  // ====================== END CONTEST SETUP ====================== //

  const candidate0 = countyCommissionersContest.candidates[0];
  const candidate1 = countyCommissionersContest.candidates[1];
  const candidate2 = countyCommissionersContest.candidates[2];
  const candidate3 = countyCommissionersContest.candidates[3];
  const candidate4 = countyCommissionersContest.candidates[4];

  // Advance to multi-seat contest
  while (!screen.queryByText(countyCommissionersContest.title)) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  // Select 5 candidates for 4 seats
  fireEvent.click(screen.getByText(candidate0.name));
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText(candidate1.name));
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText(candidate2.name));
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText(candidate3.name));
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText(candidate4.name));
  await advanceTimersAndPromises();

  // Overvote modal is displayed

  within(screen.getByRole('alertdialog')).getByText(/you must first deselect/i);

  // Go to Review Screen
  while (!screen.queryByText('Review Your Votes')) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  // Expect to see the first four selected candidates
  expect(screen.getByText(candidate0.name)).toBeTruthy();
  expect(screen.getByText(candidate1.name)).toBeTruthy();
  expect(screen.getByText(candidate2.name)).toBeTruthy();
  expect(screen.getByText(candidate3.name)).toBeTruthy();
});
