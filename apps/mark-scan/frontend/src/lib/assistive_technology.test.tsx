import { MemoryHardware, ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../test/react_testing_library';

import { App } from '../app';
import { advanceTimersAndPromises } from '../../test/helpers/timers';

import {
  contest0,
  contest0candidate0,
  contest0candidate1,
  contest1candidate0,
} from '../../test/helpers/election';

import { getActiveElement } from './assistive_technology';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

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

it('accessible controller handling works', async () => {
  const hardware = MemoryHardware.buildStandard();
  apiMock.expectGetMachineConfig();
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
  await advanceTimersAndPromises();
  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });
  await screen.findByText('Start Voting');
  screen.getByText(/Center Springfield/);
  // Go to First Contest
  userEvent.keyboard('[ArrowRight]');
  await screen.findByText(contest0.title);
  // Confirm first contest only has 1 seat
  expect(contest0.seats).toEqual(1);

  // Test navigation by accessible controller keyboard event interface
  userEvent.keyboard('[ArrowDown]');
  expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);
  userEvent.keyboard('[ArrowDown]');
  expect(getActiveElement()).toHaveTextContent(contest0candidate1.name);
  userEvent.keyboard('[ArrowUp]');
  expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);

  // test the edge case of rolling over
  await waitFor(() => {
    userEvent.keyboard('[ArrowUp]');
    expect(getActiveElement()).toHaveTextContent(contest0candidate1.name);
  });
  await waitFor(() => {
    userEvent.keyboard('[ArrowDown]');
    expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);
  });

  userEvent.keyboard('[ArrowRight]');
  await advanceTimersAndPromises();
  // go up first without focus, then down once, should be same as down once.
  userEvent.keyboard('[ArrowUp]');
  userEvent.keyboard('[ArrowDown]');
  expect(getActiveElement()).toHaveTextContent(contest1candidate0.name);
  userEvent.keyboard('[ArrowLeft]');
  await advanceTimersAndPromises();

  // Get focus again
  userEvent.keyboard('[ArrowDown]');
  expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);

  // select candidate
  userEvent.keyboard('2');
  const candidate0Option = await screen.findByRole('option', {
    name: new RegExp(contest0candidate0.name),
    selected: true,
  });

  // Focus should have jumped to the "Next" button because we're using keyboard nav
  expect(await screen.findByRole('button', { name: 'Next' })).toHaveFocus();

  // Return focus to candidate so we can test unselect
  candidate0Option.focus();
  userEvent.keyboard('2');
  await screen.findByRole('option', {
    name: new RegExp(contest0candidate0.name),
    selected: false,
  });

  // Confirm 'Okay' is only active element on page. Modal is "true" modal.
  userEvent.click(screen.getByText(contest0candidate0.name));
  userEvent.click(screen.getByText(contest0candidate1.name));
  userEvent.keyboard('[ArrowDown]'); // selects Okay button
  userEvent.keyboard('[ArrowDown]'); // Okay button should still be selected
  userEvent.keyboard('[ArrowDown]'); // Okay button should still be selected
  expect(screen.getButton(/Okay/i)).toHaveFocus();
  await advanceTimersAndPromises();
});
