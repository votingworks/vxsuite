import { mockKiosk } from '@votingworks/test-utils';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import userEvent from '@testing-library/user-event';
import { createMocks as createReactIdleTimerMocks } from 'react-idle-timer';
import {
  IDLE_RESET_TIMEOUT_SECONDS,
  IDLE_TIMEOUT_SECONDS,
} from '@votingworks/mark-flow-ui';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { render, screen, waitFor } from '../test/react_testing_library';
import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { QUIT_KIOSK_IDLE_SECONDS } from './config/globals';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  createReactIdleTimerMocks();
  window.location.href = '/';
  window.kiosk = mockKiosk();
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
  apiMock.setPaperHandlerState('waiting_for_ballot_data');
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

test('Insert Card screen idle timeout to quit app', async () => {
  apiMock.expectGetMachineConfig({
    // machineId used to determine whether we quit. Now they all do.
    // making sure a machineId that ends in 0 still triggers.
    machineId: '0000',
  });

  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  // Ensure we're on the Insert Card screen
  await screen.findByText('Insert Card');

  expect(window.kiosk?.quit).not.toHaveBeenCalled();

  // Check that we requested a quit after the idle timer fired.
  await advanceTimersAndPromises(QUIT_KIOSK_IDLE_SECONDS);
  await waitFor(() => {
    expect(window.kiosk?.quit).toHaveBeenCalledTimes(1);
  });
});

test('Voter idle timeout', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });

  // Let idle timeout kick in and acknowledge
  userEvent.click(await screen.findByText('Start Voting'));
  await advanceTimersAndPromises(IDLE_TIMEOUT_SECONDS);
  screen.getByText('Are you still voting?');
  userEvent.click(
    screen.getByRole('button', { name: 'Yes, I’m still voting.' })
  );
  await waitFor(() =>
    expect(screen.queryByText('Are you still voting?')).toBeNull()
  );

  // Let idle timeout kick in and don't acknowledge
  await advanceTimersAndPromises(IDLE_TIMEOUT_SECONDS);
  screen.getByText('Are you still voting?');
  apiMock.mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
  await advanceTimersAndPromises(IDLE_RESET_TIMEOUT_SECONDS);
  await screen.findByText('Clearing ballot');
  apiMock.setAuthStatusLoggedOut();
  await screen.findByText('Insert Card');
});
