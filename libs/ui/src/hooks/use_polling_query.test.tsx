import { afterEach, expect, test, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { deferred } from '@votingworks/basics';
import { PollingInterval, usePollingQuery } from './use_polling_query';

vi.useFakeTimers({
  shouldAdvanceTime: true,
});

afterEach(() => {
  vi.clearAllTimers();
});

const INTERVAL_MS = 1000;

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function QueryWrapper(props: { children: React.ReactNode }) {
    const { children } = props;
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

test('shares a single polling timer across all instances of a query', async () => {
  const queryClient = createTestQueryClient();
  const queryFn = vi.fn(() => Promise.resolve('data'));

  function Subscriber() {
    usePollingQuery(['sharedQuery'], queryFn, INTERVAL_MS);
    return null;
  }

  const { unmount } = render(
    <React.Fragment>
      <Subscriber />
      <Subscriber />
      <Subscriber />
    </React.Fragment>,
    { wrapper: createWrapper(queryClient) }
  );

  // The initial fetch on mount is shared by all instances
  await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

  // Each tick issues one request total, not one per instance
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS));
  expect(queryFn).toHaveBeenCalledTimes(2);
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS));
  expect(queryFn).toHaveBeenCalledTimes(3);

  // Polling stops once every instance has unmounted
  unmount();
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS * 10));
  expect(queryFn).toHaveBeenCalledTimes(3);
});

test('keeps polling while at least one instance remains mounted', async () => {
  const queryClient = createTestQueryClient();
  const queryFn = vi.fn(() => Promise.resolve('data'));

  function Subscriber() {
    usePollingQuery(['sharedQuery'], queryFn, INTERVAL_MS);
    return null;
  }

  const { rerender, unmount } = render(
    <React.Fragment>
      <Subscriber key="a" />
      <Subscriber key="b" />
    </React.Fragment>,
    { wrapper: createWrapper(queryClient) }
  );
  await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

  rerender(<Subscriber key="a" />);
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS));
  expect(queryFn).toHaveBeenCalledTimes(2);

  // Polling resumes when a new instance mounts after all unmounted
  unmount();
  render(<Subscriber />, { wrapper: createWrapper(queryClient) });
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS));
  expect(queryFn).toHaveBeenCalledTimes(3);
});

test('a function interval can pause polling until the data changes', async () => {
  const queryClient = createTestQueryClient();
  interface Status {
    isEnabled: boolean;
  }
  const queryFn = vi.fn(() => Promise.resolve<Status>({ isEnabled: false }));
  const refetchInterval: PollingInterval<Status> = (data) =>
    data?.isEnabled ? INTERVAL_MS : false;

  renderHook(
    () => usePollingQuery(['pausableQuery'], queryFn, refetchInterval),
    { wrapper: createWrapper(queryClient) }
  );
  await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

  // At mount, before any data is available, the interval function returns
  // false, and it still does once the initial fetch reports polling disabled
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS * 10));
  expect(queryFn).toHaveBeenCalledTimes(1);

  // When the data changes, the interval is re-evaluated and polling resumes
  queryFn.mockImplementation(() => Promise.resolve({ isEnabled: true }));
  act(() => {
    queryClient.setQueryData(['pausableQuery'], { isEnabled: true });
  });
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS));
  expect(queryFn).toHaveBeenCalledTimes(2);
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS));
  expect(queryFn).toHaveBeenCalledTimes(3);
});

test('while paused, ignores updates to other queries', async () => {
  const queryClient = createTestQueryClient();
  const pausedQueryFn = vi.fn(() => Promise.resolve('paused'));
  const pollingQueryFn = vi.fn(() => Promise.resolve('polling'));

  function Subscribers() {
    usePollingQuery(['pausedQuery'], pausedQueryFn, () => false);
    usePollingQuery(['pollingQuery'], pollingQueryFn, INTERVAL_MS);
    return null;
  }

  // A second subscriber of the paused query, unmounted below to send the
  // paused poller a non-update event for its own query
  function PausedSubscriber() {
    usePollingQuery(['pausedQuery'], pausedQueryFn, () => false);
    return null;
  }

  const { rerender } = render(
    <React.Fragment>
      <Subscribers />
      <PausedSubscriber />
    </React.Fragment>,
    { wrapper: createWrapper(queryClient) }
  );
  await waitFor(() => expect(pausedQueryFn).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(pollingQueryFn).toHaveBeenCalledTimes(1));

  // The polling query's updates don't resume the paused query, and neither
  // does an observer of the paused query unmounting
  rerender(<Subscribers />);
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS * 10));
  expect(pausedQueryFn).toHaveBeenCalledTimes(1);
  expect(pollingQueryFn.mock.calls.length).toBeGreaterThan(1);
});

test('does not issue requests while every observer is disabled', async () => {
  const queryClient = createTestQueryClient();
  const queryFn = vi.fn(() => Promise.resolve('data'));

  const { rerender } = renderHook(
    ({ enabled }: { enabled: boolean }) =>
      usePollingQuery(['gatedQuery'], queryFn, INTERVAL_MS, { enabled }),
    { wrapper: createWrapper(queryClient), initialProps: { enabled: false } }
  );

  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS * 10));
  expect(queryFn).not.toHaveBeenCalled();

  rerender({ enabled: true });
  await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS));
  expect(queryFn).toHaveBeenCalledTimes(2);
});

test('stops cleanly when unmounted while a refetch is in flight', async () => {
  const queryClient = createTestQueryClient();
  const initialFetch = deferred<string>();
  const queryFn = vi.fn(() => initialFetch.promise);

  const { unmount } = renderHook(
    () => usePollingQuery(['slowQuery'], queryFn, INTERVAL_MS),
    { wrapper: createWrapper(queryClient) }
  );
  await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

  // The tick fires while the initial fetch is still in flight and reuses it
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS));
  expect(queryFn).toHaveBeenCalledTimes(1);

  unmount();
  initialFetch.resolve('data');
  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS * 10));
  expect(queryFn).toHaveBeenCalledTimes(1);
});

test('polls queries with different keys independently', async () => {
  const queryClient = createTestQueryClient();
  const fastQueryFn = vi.fn(() => Promise.resolve('fast'));
  const slowQueryFn = vi.fn(() => Promise.resolve('slow'));

  function Subscribers() {
    usePollingQuery(['fastQuery'], fastQueryFn, INTERVAL_MS);
    usePollingQuery(['slowQuery'], slowQueryFn, INTERVAL_MS * 10);
    return null;
  }

  render(<Subscribers />, { wrapper: createWrapper(queryClient) });
  await waitFor(() => expect(fastQueryFn).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(slowQueryFn).toHaveBeenCalledTimes(1));

  await act(() => vi.advanceTimersByTimeAsync(INTERVAL_MS * 10));
  expect(fastQueryFn).toHaveBeenCalledTimes(11);
  expect(slowQueryFn).toHaveBeenCalledTimes(2);
});
