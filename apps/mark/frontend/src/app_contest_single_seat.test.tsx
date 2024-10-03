import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import userEvent from '@testing-library/user-event';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { BallotStyleId } from '@votingworks/types';
import {
  fireEvent,
  render,
  act,
  screen,
  within,
} from '../test/react_testing_library';
import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { presidentContest } from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
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

  render(<App reload={jest.fn()} apiClient={apiMock.mockApiClient} />);
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

  const candidate0 = presidentContest.candidates[0].name;
  const candidate1 = presidentContest.candidates[1].name;

  screen.getByText(presidentContest.title);

  // Select first candidate
  fireEvent.click(screen.getByText(candidate0));
  await advanceTimersAndPromises();

  // Select second candidate
  fireEvent.click(screen.getByText(candidate1));
  await advanceTimersAndPromises();

  // Overvote modal is displayed
  within(screen.getByRole('alertdialog')).getByText(/you must first deselect/i);

  // Close the modal
  fireEvent.click(screen.getByText('Okay'));
  await advanceTimersAndPromises();

  // First candidate is selected
  screen.getByRole('option', { name: new RegExp(candidate0), selected: true });

  // Second candidate is NOT selected
  screen.getByRole('option', { name: new RegExp(candidate1), selected: false });

  // Deselect the first candidate
  fireEvent.click(screen.getByText(candidate0));

  // Check that the aria label was updated to be include 'deselected' and is then updated back to the original state
  screen.getByRole('option', {
    name: new RegExp(`Deselected.+${candidate0}`),
    selected: false,
  });
  screen.getByRole('option', {
    name: new RegExp(`^${candidate1}`),
    selected: false,
  });
  act(() => {
    jest.advanceTimersByTime(101);
  });
  screen.getByRole('option', {
    name: new RegExp(`^${candidate0}`),
    selected: false,
  });

  await advanceTimersAndPromises();
});
