import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { fakeKiosk } from '@votingworks/test-utils';
import { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import { electionDefinition } from '../test/helpers/election';
import { render, screen } from '../test/react_testing_library';
import { App } from './app';
import { createApiMock, ApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;
let kiosk = fakeKiosk();

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  kiosk = fakeKiosk();
  window.kiosk = kiosk;

  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionDefinition(electionDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(30000);

test('`jammed` state renders jam page', async () => {
  apiMock.setPaperHandlerState('jammed');

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  await screen.findByText('Paper is Jammed');
});

test('`jam_cleared` state renders jam cleared page', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.setPaperHandlerState('jam_cleared');

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  await screen.findByText('Jam Cleared');
  screen.getByText(/The hardware is resetting/);
});

test('`resetting_state_machine_after_jam` state renders jam cleared page', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.setPaperHandlerState('resetting_state_machine_after_jam');

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  await screen.findByText('Jam Cleared');
  screen.getByText(/The hardware has been reset/);
});

test('`waiting_for_invalidated_ballot_confirmation` state renders ballot invalidation page with cardless voter auth', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.mockApiClient.getElectionState.reset();
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  apiMock.setPaperHandlerState(
    'waiting_for_invalidated_ballot_confirmation.paper_present'
  );
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(electionDefinition);
  await screen.findByText('Ask a Poll Worker for Help');
});

test('`waiting_for_invalidated_ballot_confirmation` state renders ballot invalidation page with poll worker auth', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.mockApiClient.getElectionState.reset();
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

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

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  apiMock.setPaperHandlerState('blank_page_interpretation');
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(electionDefinition);
  await screen.findByText('Ask a Poll Worker for Help');
  screen.getByText('There was a problem interpreting your ballot.');
});

test('`blank_page_interpretation` state renders BlankPageInterpretationPage for poll worker auth', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  apiMock.setPaperHandlerState('blank_page_interpretation');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: electionDefinition.election.ballotStyles[0].id,
      precinctId: electionDefinition.election.precincts[0].id,
    },
  });
  await screen.findByText('Load New Ballot Sheet');
});

test('`pat_device_connected` state renders PAT device calibration page', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  apiMock.setPaperHandlerState('pat_device_connected');
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(electionDefinition);
  await screen.findByText('Test Your Device');
});

test('`paper_reloaded` state renders PaperReloadedPage', async () => {
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  apiMock.setPaperHandlerState('paper_reloaded');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: electionDefinition.election.ballotStyles[0].id,
      precinctId: electionDefinition.election.precincts[0].id,
    },
  });
  await screen.findByText(
    'The ballot sheet has been loaded. Remove the poll worker card to continue.'
  );
});

test('`empty_ballot_box` state renders EmptyBallotBoxPage', async () => {
  apiMock.setAuthStatusCardlessVoterLoggedInWithDefaults(electionDefinition);

  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  apiMock.setPaperHandlerState('empty_ballot_box');
  await screen.findByText('Ballot Box Full');
});

const testSpecs: Array<{
  state: SimpleServerStatus;
}> = [
  { state: 'ballot_accepted' },
  { state: 'resetting_state_machine_after_success' },
];

test.each(testSpecs)(
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

    render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

    await screen.findByText('Your ballot was cast!');
    await screen.findByText('Thank you for voting.');
  }
);
