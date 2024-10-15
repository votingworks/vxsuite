import {
  electionGeneral,
  electionGeneralDefinition,
} from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import { BallotStyleId, getContestDistrictName } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import {
  fireEvent,
  render,
  within,
  act,
  screen,
} from '../test/react_testing_library';
import { App } from './app';

import { withMarkup } from '../test/helpers/with_markup';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { measure102Contest } from '../test/helpers/election';
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

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);
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

  const getByTextWithMarkup = withMarkup(screen.getByText);

  // Advance to multi-seat contest
  while (!screen.queryByRole('heading', { name: measure102Contest.title })) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  const contestChoices = within(screen.getByTestId('contest-choices'));

  // Select Yes
  fireEvent.click(contestChoices.getByText('Yes'));
  contestChoices.getByRole('option', { name: /Selected.+Yes/, selected: true });

  // Unselect Yes
  fireEvent.click(contestChoices.getByText('Yes'));

  // Check that the aria label was updated to be deselected properly and is then removed
  contestChoices.getByRole('option', {
    name: /Deselected.+Yes/,
    selected: false,
  });
  contestChoices.getByRole('option', { name: /\bNo\b/, selected: false });
  act(() => {
    jest.advanceTimersByTime(101);
  });
  contestChoices.getByRole('option', { name: /\bYes\b/, selected: false });

  // Select Yes
  fireEvent.click(contestChoices.getByText('Yes'));
  contestChoices.getByRole('option', { name: /Yes/, selected: true });

  // Select No
  fireEvent.click(contestChoices.getByText('No'));
  contestChoices.getByRole('option', {
    name: /\bNo\b/,
    hidden: true, // Hidden by overvote modal.
    selected: false,
  });

  // Overvote modal is displayed
  within(screen.getByRole('alertdialog')).getByText(/first deselect/i);
  fireEvent.click(screen.getByText('Continue'));
  await advanceTimersAndPromises(); // For 200ms Delay in closing modal

  // Go to review page and confirm write in exists
  while (!screen.queryByText('Review Your Votes')) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  const reviewTitle = getByTextWithMarkup(
    `${getContestDistrictName(electionGeneral, measure102Contest)}${
      measure102Contest.title
    }`
  );
  const siblingTextContent =
    (reviewTitle.nextSibling && reviewTitle.nextSibling.textContent) || '';
  expect(siblingTextContent.trim()).toEqual('Yes');
});
