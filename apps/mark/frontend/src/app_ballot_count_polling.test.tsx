import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { anyPollingPlace } from '@votingworks/types';
import type { ElectionState } from '@votingworks/mark-backend';
import { render, screen } from '../test/react_testing_library.js';
import {
  type ApiMock,
  createApiMock,
} from '../test/helpers/mock_api_client.js';
import { App } from './app.js';
import { initialElectionState } from './app_root.js';
import { ELECTION_STATE_POLLING_INTERVAL_MS } from './api.js';

const electionDefinition = readElectionGeneralDefinition();
const pollingPlace = anyPollingPlace(electionDefinition.election);

let apiMock: ApiMock;

function ballotsPrintedText(): string {
  return screen
    .getByText('Ballots Printed:')
    .parentElement!.textContent.replace(/\s+/g, ' ')
    .trim();
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  vi.useRealTimers();
});

test('picks up a ballot count written by the backend', async () => {
  const electionState: ElectionState = {
    ...initialElectionState,
    pollingPlaceId: pollingPlace.id,
    ballotsPrintedCount: 0,
    pollsState: 'polls_open',
  };
  apiMock.mockApiClient.getElectionState.mockImplementation(() =>
    Promise.resolve({ ...electionState })
  );

  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionDefinition);
  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setAuthStatusElectionManagerLoggedIn(electionDefinition);
  apiMock.expectGetUsbPortStatus();
  await screen.findByText('Election Manager Menu');
  expect(ballotsPrintedText()).toEqual('Ballots Printed: 0');

  electionState.ballotsPrintedCount = 1;
  await vi.advanceTimersByTimeAsync(ELECTION_STATE_POLLING_INTERVAL_MS);

  await vi.waitFor(() => {
    expect(ballotsPrintedText()).toEqual('Ballots Printed: 1');
  });
});
