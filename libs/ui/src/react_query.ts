// eslint-disable-next-line vx/gts-no-import-export-type
import type { DefaultOptions } from '@tanstack/react-query';

/**
 * Recommended default options for react-query query clients
 */
export const QUERY_CLIENT_DEFAULT_OPTIONS: DefaultOptions = {
  queries: {
    // Since our backend is always local, we don't want react-query to "pause"
    // when it can't detect a network connection.
    networkMode: 'always',

    // If the server is unreachable or an unexpected error occurs, don't retry.
    retry: false,

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
  },
  mutations: {
    networkMode: 'always',
    retry: false,
    useErrorBoundary: true,
  },
};
