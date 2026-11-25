import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { deferred } from '@votingworks/basics';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import type { StatusUpdate } from '@votingworks/scan-backend';
import {
  type ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../test/helpers/mock_api_client.js';
import { render, screen } from '../test/react_testing_library.js';
import { getScannerStatus } from './api.js';

const RETRY_DELAY_MS = 1000;

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
  apiMock.expectGetConfig();
});

afterEach(() => {
  vi.useRealTimers();
});

function BallotCount(): JSX.Element {
  const query = getScannerStatus.useQuery();
  return <div>Ballots: {query.data?.ballotsCounted ?? 'unknown'}</div>;
}

test('caches each status the backend reports', async () => {
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 3 });
  render(provideApi(apiMock, <BallotCount />));
  await screen.findByText('Ballots: 3');
});

test('starts over after a backend restart', async () => {
  function updateWithBallots(ballotsCounted: number): StatusUpdate {
    return {
      revision: 1,
      statuses: { scanner: { ...statusNoPaper, ballotsCounted } },
    };
  }
  let restarted = false;
  let failures = 0;
  apiMock.mockApiClient.getStatusUpdate = vi.fn(
    async ({ since }: { since?: number }) => {
      if (since === undefined) {
        return updateWithBallots(restarted ? 7 : 3);
      }
      if (restarted) return deferred<StatusUpdate>().promise;
      failures += 1;
      restarted = failures === 2;
      throw new Error('HTTP 504');
    }
  );

  render(provideApi(apiMock, <BallotCount />));
  await screen.findByText('Ballots: 3');
  await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * (1 + 2));
  await screen.findByText('Ballots: 7');
});

test('surfaces errors that are not worth retrying', async () => {
  apiMock.mockApiClient.getStatusUpdate = vi
    .fn()
    .mockRejectedValue(new Error('HTTP 500'));

  await suppressingConsoleOutput(async () => {
    render(provideApi(apiMock, <BallotCount />));
    await screen.findByText('Test Error Boundary');
  });
  screen.getByText(/HTTP 500/);
});

test('surfaces a 504 once retries are exhausted', async () => {
  apiMock.mockApiClient.getStatusUpdate = vi
    .fn()
    .mockRejectedValue(new Error('HTTP 504'));

  await suppressingConsoleOutput(async () => {
    render(provideApi(apiMock, <BallotCount />));
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * (1 + 2 + 4) + 1);
    expect(screen.queryByText('Test Error Boundary')).toBeNull();
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 8);
    await screen.findByText('Test Error Boundary');
  });
});
