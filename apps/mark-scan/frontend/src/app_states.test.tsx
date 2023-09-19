import { MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { fakeKiosk, hasTextAcrossElements } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import {
  electionDefinition,
  election,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { render, screen, within } from '../test/react_testing_library';
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
  apiMock.expectGetPrecinctSelectionResolvesDefault(election);
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

jest.setTimeout(30000);

test('`jammed` state renders jam page', async () => {
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await setElectionInStorage(storage);
  await setStateInStorage(storage);
  apiMock.setPaperHandlerState('jammed');

  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );

  await screen.findByText('Paper is Jammed');
});

test('`jam_cleared` state renders jam cleared page', async () => {
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await setElectionInStorage(storage);
  await setStateInStorage(storage);
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.setPaperHandlerState('jam_cleared');

  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );

  await screen.findByText('Jam Cleared');
  screen.getByText(/The hardware is resetting/);
});

test('`resetting_state_machine_after_jam` state renders jam cleared page', async () => {
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await setElectionInStorage(storage);
  await setStateInStorage(storage);
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  apiMock.setPaperHandlerState('resetting_state_machine_after_jam');

  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );

  await screen.findByText('Jam Cleared');
  screen.getByText(/The hardware has been reset/);
});

test('`waiting_for_invalidated_ballot_confirmation` state renders ballot invalidation page with cardless voter auth', async () => {
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await setElectionInStorage(storage);
  await setStateInStorage(storage);
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );

  // Open Polls
  // Once state is moved to the backend this can be mocked more concisely
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));
  userEvent.click(screen.getByText('Open Polls'));
  userEvent.click(
    within(await screen.findByRole('alertdialog')).getByText('Open Polls')
  );
  await screen.findByText(hasTextAcrossElements('Polls: Open'));

  apiMock.setPaperHandlerState('waiting_for_invalidated_ballot_confirmation');
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: electionDefinition.election.ballotStyles[0].id,
    precinctId: electionDefinition.election.precincts[0].id,
  });
  await screen.findByText('Ask a Poll Worker for Help');
});

test('`waiting_for_invalidated_ballot_confirmation` state renders ballot invalidation page with poll worker auth', async () => {
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  await setElectionInStorage(storage);
  await setStateInStorage(storage);
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);

  render(
    <App
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );

  // Open Polls
  // Once state is moved to the backend this can be mocked more concisely
  await screen.findByText(hasTextAcrossElements('Polls: Closed'));
  userEvent.click(screen.getByText('Open Polls'));
  userEvent.click(
    within(await screen.findByRole('alertdialog')).getByText('Open Polls')
  );
  await screen.findByText(hasTextAcrossElements('Polls: Open'));

  apiMock.setPaperHandlerState('waiting_for_invalidated_ballot_confirmation');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: electionDefinition.election.ballotStyles[0].id,
      precinctId: electionDefinition.election.precincts[0].id,
    },
  });
  await screen.findByText('Remove Ballot');
});
