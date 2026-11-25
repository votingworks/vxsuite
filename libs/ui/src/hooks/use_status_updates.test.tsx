import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { deferred } from '@votingworks/basics';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { useState } from 'react';
import { render, screen } from '../../test/react_testing_library.js';
import { TestErrorBoundary } from '../error_boundary.js';
import { useStatusUpdates } from './use_status_updates.js';

const RETRY_DELAY_MS = 1000;

interface Update {
  readonly revision: number;
  readonly ballots: number;
}

type GetStatusUpdate = (input: { since?: number }) => Promise<Update>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

function BallotCount({
  getStatusUpdate,
}: {
  getStatusUpdate: GetStatusUpdate;
}): JSX.Element {
  const [update, setUpdate] = useState<Update>();
  useStatusUpdates<Update>({ getStatusUpdate, onUpdate: setUpdate });
  return <div>Ballots: {update?.ballots ?? 'unknown'}</div>;
}

function renderBallotCount(getStatusUpdate: GetStatusUpdate) {
  return render(
    <TestErrorBoundary>
      <BallotCount getStatusUpdate={getStatusUpdate} />
    </TestErrorBoundary>
  );
}

test('reports each update and long-polls from its revision', async () => {
  const second = deferred<Update>();
  const getStatusUpdate = vi.fn<GetStatusUpdate>(({ since }) => {
    if (since === undefined)
      return Promise.resolve({ revision: 1, ballots: 3 });
    if (since === 1) return second.promise;
    return deferred<Update>().promise;
  });

  renderBallotCount(getStatusUpdate);
  await screen.findByText('Ballots: 3');
  second.resolve({ revision: 2, ballots: 4 });
  await screen.findByText('Ballots: 4');
  expect(getStatusUpdate).toHaveBeenLastCalledWith({ since: 2 });
});

test('starts over after a backend restart', async () => {
  let restarted = false;
  let failures = 0;
  const getStatusUpdate = vi.fn<GetStatusUpdate>(async ({ since }) => {
    if (since === undefined) return { revision: 1, ballots: restarted ? 7 : 3 };
    if (restarted) return deferred<Update>().promise;
    failures += 1;
    restarted = failures === 2;
    throw new Error('HTTP 504');
  });

  renderBallotCount(getStatusUpdate);
  await screen.findByText('Ballots: 3');
  await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * (1 + 2));
  await screen.findByText('Ballots: 7');
});

test('surfaces errors that are not worth retrying', async () => {
  const getStatusUpdate = vi
    .fn<GetStatusUpdate>()
    .mockRejectedValue(new Error('HTTP 500'));

  await suppressingConsoleOutput(async () => {
    renderBallotCount(getStatusUpdate);
    await screen.findByText('Test Error Boundary');
  });
  screen.getByText(/HTTP 500/);
});

test('surfaces a 504 once retries are exhausted', async () => {
  const getStatusUpdate = vi
    .fn<GetStatusUpdate>()
    .mockRejectedValue(new Error('HTTP 504'));

  await suppressingConsoleOutput(async () => {
    renderBallotCount(getStatusUpdate);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * (1 + 2 + 4) + 1);
    expect(screen.queryByText('Test Error Boundary')).toBeNull();
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 8);
    await screen.findByText('Test Error Boundary');
  });
});

test('stops polling once unmounted', async () => {
  const pending = deferred<Update>();
  const getStatusUpdate = vi.fn<GetStatusUpdate>(() => pending.promise);

  const { unmount } = renderBallotCount(getStatusUpdate);
  await vi.waitFor(() => expect(getStatusUpdate).toHaveBeenCalled());
  const calls = getStatusUpdate.mock.calls.length;
  unmount();
  pending.resolve({ revision: 1, ballots: 3 });
  await vi.advanceTimersByTimeAsync(0);
  expect(getStatusUpdate).toHaveBeenCalledTimes(calls);
});

test('stops retrying once unmounted', async () => {
  const failed = deferred<Update>();
  const getStatusUpdate = vi.fn<GetStatusUpdate>(() => failed.promise);

  const { unmount } = renderBallotCount(getStatusUpdate);
  await vi.waitFor(() => expect(getStatusUpdate).toHaveBeenCalled());
  const calls = getStatusUpdate.mock.calls.length;
  unmount();
  failed.reject(new Error('HTTP 504'));
  await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 2);
  expect(getStatusUpdate).toHaveBeenCalledTimes(calls);
});
