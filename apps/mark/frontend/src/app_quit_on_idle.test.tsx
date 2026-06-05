import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { createMocks as createReactIdleTimerMocks } from 'react-idle-timer';
import {
  IDLE_RESET_TIMEOUT_SECONDS,
  IDLE_TIMEOUT_SECONDS,
} from '@votingworks/mark-flow-ui';
import { anyPollingPlace } from '@votingworks/types';
import { render, screen } from '../test/react_testing_library';
import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  createReactIdleTimerMocks();
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('Voter idle timeout', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  const pollingPlace = anyPollingPlace(electionDefinition.election);

  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(readElectionGeneralDefinition());
  apiMock.expectGetElectionState({
    pollingPlaceId: pollingPlace.id,
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
  await vi.waitFor(() =>
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
