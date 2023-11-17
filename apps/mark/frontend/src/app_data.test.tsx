import { screen } from '../test/react_testing_library';

import {
  election,
  electionDefinition,
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
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

describe('loads election', () => {
  it('Machine is not configured by default', async () => {
    const { renderApp } = buildApp(apiMock);
    apiMock.expectGetElectionDefinition(null);
    renderApp();

    // Let the initial hardware detection run.
    await advanceTimersAndPromises();

    screen.getByText('VxMark is Not Configured');
  });

  it('from backend', async () => {
    const { storage, renderApp } = buildApp(apiMock);
    apiMock.expectGetElectionDefinition(electionDefinition);
    await setStateInStorage(storage);
    renderApp();

    await screen.findByText(election.title);
  });
});
