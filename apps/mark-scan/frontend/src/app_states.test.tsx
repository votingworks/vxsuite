import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import React from 'react';
import { electionDefinition } from '../test/helpers/election';
import { render, screen } from '../test/react_testing_library';
import { App } from './app';
import { createApiMock, ApiMock } from '../test/helpers/mock_api_client';
import { JammedPage } from './pages/jammed_page';
import { JamClearedPage } from './pages/jam_cleared_page';
import { BallotContext } from './contexts/ballot_context';
import { StartScreen } from './pages/start_screen';
import { JAM_CLEARED_STATES } from './pages/replace_jammed_sheet_screen';

const electionGeneralDefinition = readElectionGeneralDefinition();

vi.mock(import('./pages/jam_cleared_page.js'));
vi.mock(import('./pages/jammed_page.js'));
vi.mock(import('./pages/start_screen.js'));

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();

  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

vi.setConfig({
  testTimeout: 30_000,
});

test('`jammed` state renders jam page', async () => {
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(
    electionGeneralDefinition
  );
  apiMock.mockApiClient.getElectionState.reset();
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });
  apiMock.setPaperHandlerState('waiting_for_ballot_data');

  const authStatus = await apiMock.mockApiClient.getAuthStatus();
  vi.mocked(JammedPage).mockImplementation((props) => {
    expect(props.authStatus).toEqual(authStatus);
    expect(props.votes).toEqual({ contest1: ['yes'] });

    return <div>mockJammedPage</div>;
  });

  vi.mocked(StartScreen).mockImplementation(() => {
    const { updateVote } = React.useContext(BallotContext);

    React.useEffect(() => updateVote('contest1', ['yes']), [updateVote]);

    return <div>mockStartScreen</div>;
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  await screen.findByText('mockStartScreen');

  apiMock.setPaperHandlerState('jammed');

  await screen.findByText('mockJammedPage');
});

test('`jam_cleared` state renders jam cleared page', async () => {
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(
    electionGeneralDefinition
  );
  apiMock.setPaperHandlerState('jam_cleared');

  const authStatus = await apiMock.mockApiClient.getAuthStatus();
  vi.mocked(JamClearedPage).mockImplementation((props) => {
    expect(props.authStatus).toEqual(authStatus);
    expect(props.stateMachineState).toEqual('jam_cleared');

    return <div>mockJamClearedPage</div>;
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  await screen.findByText('mockJamClearedPage');
});

test('`unrecoverable_error` state renders unrecoverable error page', async () => {
  apiMock.setPaperHandlerState('unrecoverable_error');

  render(<App apiClient={apiMock.mockApiClient} />);

  await screen.findByText('Something went wrong');
});

test.each(JAM_CLEARED_STATES)('%s state renders JamClearedPage', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.setPaperHandlerState('resetting_state_machine_after_jam');

  const authStatus = await apiMock.mockApiClient.getAuthStatus();
  vi.mocked(JamClearedPage).mockImplementation((props) => {
    expect(props.authStatus).toEqual(authStatus);
    expect(props.stateMachineState).toEqual(
      'resetting_state_machine_after_jam'
    );

    return <div>mockJamClearedPage</div>;
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  await screen.findByText('mockJamClearedPage');
});

test('`waiting_for_invalidated_ballot_confirmation` state renders ballot invalidation page with cardless voter auth', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.mockApiClient.getElectionState.reset();
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setPaperHandlerState(
    'waiting_for_invalidated_ballot_confirmation.paper_present'
  );
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(electionDefinition);
  await screen.findByText('Ask a poll worker for help');
});

test('`waiting_for_invalidated_ballot_confirmation` state renders ballot invalidation page with poll worker auth', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.mockApiClient.getElectionState.reset();
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setPaperHandlerState(
    'waiting_for_invalidated_ballot_confirmation.paper_present'
  );
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: electionDefinition.election.ballotStyles[0].id,
      precinctId: electionDefinition.election.precincts[0].id,
    },
  });
  await screen.findByText('Remove Ballot');
});

test('`blank_page_interpretation` state renders BlankPageInterpretationPage for cardless voter auth', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setPaperHandlerState('blank_page_interpretation');
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(electionDefinition);
  await screen.findByText('Ask a poll worker for help');
  screen.getByText('There was a problem interpreting your ballot.');
});

test('`blank_page_interpretation` state renders BlankPageInterpretationPage for poll worker auth', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setPaperHandlerState('blank_page_interpretation');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: electionDefinition.election.ballotStyles[0].id,
      precinctId: electionDefinition.election.precincts[0].id,
    },
  });
  await screen.findByText('Load New Ballot Sheet');
});

test('`paper_reloaded` state renders PaperReloadedPage', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setPaperHandlerState('paper_reloaded');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: electionDefinition.election.ballotStyles[0].id,
      precinctId: electionDefinition.election.precincts[0].id,
    },
  });
  await screen.findByText('The ballot sheet has been loaded.');
  screen.getByText('Remove the poll worker card to continue.');
});

test('`empty_ballot_box` state renders EmptyBallotBoxPage', async () => {
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(electionDefinition);

  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setPaperHandlerState('empty_ballot_box');
  await screen.findByText('Ballot Box Full');
});

const ballotCastPageTestSpecs: Array<{
  state: SimpleServerStatus;
}> = [
  { state: 'ballot_accepted' },
  { state: 'resetting_state_machine_after_success' },
];

test.each(ballotCastPageTestSpecs)(
  '$state state renders BallotSuccessfullyCastPage',
  async ({ state }) => {
    apiMock.mockApiClient.getElectionState.reset();
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
      isTestMode: false,
    });
    apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(electionDefinition);
    apiMock.setPaperHandlerState(state);

    render(<App apiClient={apiMock.mockApiClient} />);

    await screen.findByText('Your ballot was cast!');
    await screen.findByText('Thank you for voting.');
  }
);

const authEndedEarlyPageTestSpecs: Array<{
  state: SimpleServerStatus;
  auth: 'cardless_voter' | 'logged_out';
}> = [
  { state: 'poll_worker_auth_ended_unexpectedly', auth: 'cardless_voter' },
  { state: 'poll_worker_auth_ended_unexpectedly', auth: 'logged_out' },
  { state: 'loading_new_sheet', auth: 'cardless_voter' },
  { state: 'loading_new_sheet', auth: 'logged_out' },
];

test.each(authEndedEarlyPageTestSpecs)(
  '$state state renders PollWorkerAuthEndedUnexpectedlyPage',
  async ({ state, auth }) => {
    apiMock.setPaperHandlerState(state);
    if (auth === 'cardless_voter') {
      apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(
        electionDefinition
      );
    } else {
      apiMock.setAuthStatusLoggedOut();
    }

    render(<App apiClient={apiMock.mockApiClient} />);

    await screen.findByText(
      'The poll worker card was removed before paper loading completed. Please try again.'
    );
  }
);
