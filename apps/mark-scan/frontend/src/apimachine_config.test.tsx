import { afterEach, beforeEach, test, vi } from 'vitest';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { render, screen } from '../test/react_testing_library';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { advanceTimersAndPromises } from '../test/helpers/timers';
import { App } from './app';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('machineConfig is fetched from api client by default', async () => {
  apiMock.expectGetMachineConfig({
    codeVersion: 'mock-code-version',
  });
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  render(<App apiClient={apiMock.mockApiClient} />);
  await advanceTimersAndPromises();
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  await screen.findByText('mock-code-version');
});
