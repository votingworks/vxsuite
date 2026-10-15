import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { assertDefined, type Deferred, deferred } from '@votingworks/basics';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { type ApiClient, ApiClientContext, createQueryClient } from '../api.js';
import { useWatchUsbDriveStatus } from './use_watch_usb_drive_status.js';

const USB_DRIVE_STATUS_QUERY_KEY = ['getUsbDriveStatus'];

interface MockWatch {
  readonly apiClient: ApiClient;
  readonly waitForUsbDriveChange: ReturnType<typeof vi.fn>;
  latestPoll(): Deferred<number>;
}

function buildMockWatch(): MockWatch {
  const polls: Array<Deferred<number>> = [];
  const waitForUsbDriveChange = vi.fn(() => {
    const poll = deferred<number>();
    polls.push(poll);
    return poll.promise;
  });
  const apiClient = {
    waitForUsbDriveChange,
    getUsbDriveStatus: vi.fn(() =>
      Promise.resolve(mockUsbDriveStatus('no_drive'))
    ),
  } as unknown as ApiClient;
  return {
    apiClient,
    waitForUsbDriveChange,
    latestPoll: () => assertDefined(polls.at(-1)),
  };
}

function renderWatchHook(apiClient: ApiClient, queryClient: QueryClient) {
  return renderHook(() => useWatchUsbDriveStatus(), {
    wrapper: ({ children }) => (
      <ApiClientContext.Provider value={apiClient}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </ApiClientContext.Provider>
    ),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

test('invalidates the USB drive status query when the sequence advances', async () => {
  const { apiClient, waitForUsbDriveChange, latestPoll } = buildMockWatch();
  const queryClient = createQueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  renderWatchHook(apiClient, queryClient);
  await waitFor(() =>
    expect(waitForUsbDriveChange).toHaveBeenCalledWith({ lastSeq: 0 })
  );
  expect(invalidateSpy).not.toHaveBeenCalled();

  // A sequence ahead of the caller's `lastSeq` means a change occurred.
  latestPoll().resolve(1);
  await waitFor(() =>
    expect(invalidateSpy).toHaveBeenCalledWith(USB_DRIVE_STATUS_QUERY_KEY)
  );
  // The next poll advances its cursor to the observed sequence.
  await waitFor(() =>
    expect(waitForUsbDriveChange).toHaveBeenLastCalledWith({ lastSeq: 1 })
  );
});

test('does not invalidate when the sequence is unchanged (timeout)', async () => {
  const { apiClient, waitForUsbDriveChange, latestPoll } = buildMockWatch();
  const queryClient = createQueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  renderWatchHook(apiClient, queryClient);
  await waitFor(() => expect(waitForUsbDriveChange).toHaveBeenCalled());
  const initialCallCount = waitForUsbDriveChange.mock.calls.length;

  // The timeout resolves with the same sequence the caller passed in.
  latestPoll().resolve(0);
  // The loop re-issues the long-poll (still from seq 0) without invalidating.
  await waitFor(() =>
    expect(waitForUsbDriveChange).toHaveBeenCalledTimes(initialCallCount + 1)
  );
  expect(waitForUsbDriveChange).toHaveBeenLastCalledWith({ lastSeq: 0 });
  expect(invalidateSpy).not.toHaveBeenCalled();
});

test('backs off and retries when the long-poll fails', async () => {
  const { apiClient, waitForUsbDriveChange, latestPoll } = buildMockWatch();
  const queryClient = createQueryClient();

  renderWatchHook(apiClient, queryClient);
  await waitFor(() => expect(waitForUsbDriveChange).toHaveBeenCalled());
  const initialCallCount = waitForUsbDriveChange.mock.calls.length;

  latestPoll().reject(new Error('network error'));
  await vi.advanceTimersByTimeAsync(999);
  expect(waitForUsbDriveChange).toHaveBeenCalledTimes(initialCallCount);

  await vi.advanceTimersByTimeAsync(1);
  await waitFor(() =>
    expect(waitForUsbDriveChange).toHaveBeenCalledTimes(initialCallCount + 1)
  );
});

test('stops polling after unmount', async () => {
  const { apiClient, waitForUsbDriveChange, latestPoll } = buildMockWatch();
  const queryClient = createQueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  const { unmount } = renderWatchHook(apiClient, queryClient);
  await waitFor(() => expect(waitForUsbDriveChange).toHaveBeenCalled());
  const callCount = waitForUsbDriveChange.mock.calls.length;

  unmount();
  latestPoll().resolve(1);
  await vi.advanceTimersByTimeAsync(1000);

  expect(waitForUsbDriveChange).toHaveBeenCalledTimes(callCount);
  expect(invalidateSpy).not.toHaveBeenCalled();
});
