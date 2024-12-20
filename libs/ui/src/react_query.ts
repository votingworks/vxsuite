import type { DefaultOptions } from '@tanstack/react-query';
import { persistDataReferenceIfDeepEqual } from '@votingworks/utils';

/**
 * A custom retry function
 *
 * A 504 in VxSuite usually just indicates that the backend is starting up (or restarting), in
 * which case we should retry, but still with a bound in case the backend is completely failing to
 * start up.
 *
 * 1 original attempt + 4 retry attempts
 * = 0 + 1 + 2 + 4 + 8 seconds (because of exponential backoff)
 * = 15 seconds of total wait time
 *
 * Otherwise, don't retry. Because everything is local, we don't expect intermittent errors.
 *
 * TODO: Remove this custom retry logic if/when we update our infrastructure to only start the
 * frontend once the backend is running.
 */
export function shouldRetry(failedRetryCount: number, error: unknown): boolean {
  const isBackendLikelyStartingUp =
    error instanceof Error && error.message.includes('504');
  return isBackendLikelyStartingUp && failedRetryCount < 4;
}

/**
 * Recommended default options for react-query query clients
 */
export const QUERY_CLIENT_DEFAULT_OPTIONS: DefaultOptions = {
  queries: {
    // Since our backend is always local, we don't want react-query to "pause"
    // when it can't detect a network connection.
    networkMode: 'always',

    retry: shouldRetry,

    // Never mark cached data as stale automatically. This will prevent
    // automatic refetching of data (e.g. upon navigating to a page). Cached
    // queries will only be re-fetched when we explicitly invalidate the query
    // after a mutation. This is an appropriate strategy in VxSuite since
    // there is only ever one frontend client updating the backend, so we
    // don't expect data to change on the backend except when we mutate it.
    staleTime: Infinity,

    // If a query fails with an unexpected error, throw it during the render
    // phase so it will propagate up to the nearest error boundary. Consumers
    // are responsible for defining a global error boundary.
    useErrorBoundary: true,

    // react-query's default method here, `replaceEqualDeep`, does not consider
    // two objects equal unless they both have the same plain object prototype.
    // This means that two identical Dates, for example, would not be considered
    // equal, so we use our own helper leveraging lodash's `deepEqual`.
    structuralSharing: persistDataReferenceIfDeepEqual,
  },
  mutations: {
    networkMode: 'always',
    retry: shouldRetry,
    useErrorBoundary: true,
  },
};
