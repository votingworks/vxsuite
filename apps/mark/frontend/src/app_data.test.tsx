import { screen } from '../test/react_testing_library';

import { electionStorageKey } from './app_root';

import {
  election,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { advanceTimersAndPromises } from '../test/helpers/timers';
import { buildApp } from '../test/helpers/build_app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

describe('loads election', () => {
  it('Machine is not configured by default', async () => {
    const { renderApp } = buildApp(apiMock);
    renderApp();

    // Let the initial hardware detection run.
    await advanceTimersAndPromises();

    screen.getByText('VxMark is Not Configured');
  });

  it('from storage', async () => {
    const { storage, renderApp } = buildApp(apiMock);
    await setElectionInStorage(storage);
    await setStateInStorage(storage);
    renderApp();

    await screen.findByText(election.title);
    expect(storage.get(electionStorageKey)).toBeTruthy();
  });
});
