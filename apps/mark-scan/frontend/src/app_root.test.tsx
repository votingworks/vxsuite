import { advancePromises, mockOf } from '@votingworks/test-utils';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import React from 'react';
import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';
import { PollWorkerScreen } from './pages/poll_worker_screen';
import { VoterFlow } from './voter_flow';
import { AppRoot, POLL_WORKER_AUTH_REQUIRED_STATES } from './app_root';
import { render } from '../test/test_utils';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import {
  mockCardlessVoterLoggedInAuth,
  mockPollWorkerAuth,
} from '../test/helpers/mock_auth';
import { screen } from '../test/react_testing_library';
import { PollWorkerAuthEndedUnexpectedlyPage } from './pages/poll_worker_auth_ended_unexpectedly_page';

jest.mock('./voter_flow');
jest.mock('./pages/poll_worker_screen');
jest.mock('./pages/poll_worker_auth_ended_unexpectedly_page');

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
});

test('setVotes action', async () => {
  const electionDefinition = electionGeneralDefinition;
  apiMock.expectGetElectionDefinition(electionDefinition);
  apiMock.setAuthStatus(mockPollWorkerAuth(electionDefinition));
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  apiMock.setPaperHandlerState('not_accepting_paper');
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  mockOf(PollWorkerScreen).mockImplementation((props) => {
    const { setVotes } = props;
    React.useEffect(() => setVotes({ contest2: ['yes'] }), [setVotes]);

    return <div>MockPollWorkerScreen</div>;
  });

  render(<AppRoot />, {
    apiMock,
    electionDefinition,
  });

  await screen.findByText('MockPollWorkerScreen', undefined);

  mockOf(VoterFlow).mockImplementation((props) => {
    const { votes } = props;
    expect(votes).toEqual({ contest2: ['yes'] });

    return <div>MockVoterFlow</div>;
  });

  apiMock.setAuthStatus(mockCardlessVoterLoggedInAuth(electionDefinition));
  apiMock.setPaperHandlerState('waiting_for_ballot_data');

  await jest.advanceTimersByTimeAsync(AUTH_STATUS_POLLING_INTERVAL_MS * 2);
  await screen.findByText('MockVoterFlow');
});

describe('renders PollWorkerAuthEndedUnexpectedlyPage for relevant states:', () => {
  const electionDefinition = electionGeneralDefinition;

  beforeEach(() => {
    apiMock.expectGetElectionDefinition(electionDefinition);
    apiMock.expectGetMachineConfig();
    apiMock.expectGetSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });
  });

  for (const state of POLL_WORKER_AUTH_REQUIRED_STATES) {
    test(state, async () => {
      mockOf(PollWorkerAuthEndedUnexpectedlyPage).mockImplementation(() => (
        <div>MockUnexpectedAuthScreen</div>
      ));

      apiMock.setAuthStatus(mockCardlessVoterLoggedInAuth(electionDefinition));
      apiMock.setPaperHandlerState(state);

      const { container } = render(<AppRoot />, {
        apiMock,
        electionDefinition,
      });
      await advancePromises();

      expect(container).toHaveTextContent('MockUnexpectedAuthScreen');
    });
  }
});
