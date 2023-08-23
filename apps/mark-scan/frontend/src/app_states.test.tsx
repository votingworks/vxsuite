import { MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { fakeKiosk } from '@votingworks/test-utils';
import {
  electionDefinition,
  election,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
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
