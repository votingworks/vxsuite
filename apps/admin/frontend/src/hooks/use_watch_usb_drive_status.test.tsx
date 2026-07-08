import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { deferred } from '@votingworks/basics';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { ApiClient, ApiClientContext, createQueryClient } from '../api';
import { useWatchUsbDriveStatus } from './use_watch_usb_drive_status';

const USB_DRIVE_STATUS_QUERY_KEY = ['getUsbDriveStatus'];

function buildApiClient(
  waitForUsbDriveChange: () => Promise<boolean>
): ApiClient {
  return {
    waitForUsbDriveChange: vi.fn(waitForUsbDriveChange),
    getUsbDriveStatus: vi.fn(() =>
      Promise.resolve(mockUsbDriveStatus('no_drive'))
    ),
  } as unknown as ApiClient;
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

function pending(): Promise<boolean> {
  return new Promise<boolean>(() => {});
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

test('invalidates the USB drive status query when a change is signaled', async () => {
  const change = deferred<boolean>();
  let callCount = 0;
  const apiClient = buildApiClient(() => {
    callCount += 1;
    return callCount === 1 ? change.promise : pending();
  });
  const queryClient = createQueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  renderWatchHook(apiClient, queryClient);
  await waitFor(() =>
    expect(apiClient.waitForUsbDriveChange).toHaveBeenCalled()
  );
  expect(invalidateSpy).not.toHaveBeenCalled();

  change.resolve(true);
  await waitFor(() =>
    expect(invalidateSpy).toHaveBeenCalledWith(USB_DRIVE_STATUS_QUERY_KEY)
  );
});

test('does not invalidate when the long-poll times out with no change', async () => {
  const timeout = deferred<boolean>();
  let callCount = 0;
  const apiClient = buildApiClient(() => {
    callCount += 1;
    return callCount === 1 ? timeout.promise : pending();
  });
  const queryClient = createQueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  renderWatchHook(apiClient, queryClient);

  timeout.resolve(false);
  // The loop should re-issue the long-poll without invalidating anything.
  await waitFor(() =>
    expect(apiClient.waitForUsbDriveChange).toHaveBeenCalledTimes(2)
  );
  expect(invalidateSpy).not.toHaveBeenCalled();
});

test('backs off and retries when the long-poll fails', async () => {
  let callCount = 0;
  const apiClient = buildApiClient(() => {
    callCount += 1;
    return callCount === 1
      ? Promise.reject(new Error('network error'))
      : pending();
  });
  const queryClient = createQueryClient();

  renderWatchHook(apiClient, queryClient);
  await waitFor(() =>
    expect(apiClient.waitForUsbDriveChange).toHaveBeenCalledTimes(1)
  );

  // It should not retry until the backoff has elapsed.
  await vi.advanceTimersByTimeAsync(1000);
  await waitFor(() =>
    expect(apiClient.waitForUsbDriveChange).toHaveBeenCalledTimes(2)
  );
});

test('stops polling after unmount', async () => {
  const apiClient = buildApiClient(pending);
  const queryClient = createQueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  const { unmount } = renderWatchHook(apiClient, queryClient);
  await waitFor(() =>
    expect(apiClient.waitForUsbDriveChange).toHaveBeenCalledTimes(1)
  );

  unmount();
  await vi.advanceTimersByTimeAsync(1000);

  expect(apiClient.waitForUsbDriveChange).toHaveBeenCalledTimes(1);
  expect(invalidateSpy).not.toHaveBeenCalled();
});
