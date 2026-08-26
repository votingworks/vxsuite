import { useEffect, useRef } from 'react';
import {
  QueryClient,
  QueryFunction,
  QueryKey,
  UseQueryOptions,
  UseQueryResult,
  hashQueryKey,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

/**
 * The polling interval for {@link usePollingQuery}: a fixed delay in
 * milliseconds, or a function of the query's latest data returning a delay,
 * or `false` to pause polling until the query's data next changes (e.g. via
 * an invalidation or a newly mounted instance's initial fetch).
 */
export type PollingInterval<T> = number | ((data?: T) => number | false);

interface PollingRegistration {
  getInterval(): number | false;
}

interface Poller {
  readonly registrations: Set<PollingRegistration>;
  stop(): void;
}

function createPoller(
  queryClient: QueryClient,
  queryKey: QueryKey,
  queryHash: string,
  registration: PollingRegistration
): Poller {
  const registrations = new Set([registration]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pausedUntilUpdate = false;

  function schedule(): void {
    const [currentRegistration] = registrations;
    if (!currentRegistration) {
      // Every instance unmounted while a refetch was in flight.
      return;
    }
    const interval = currentRegistration.getInterval();
    if (interval === false) {
      pausedUntilUpdate = true;
      return;
    }
    timer = setTimeout(() => {
      void queryClient
        .refetchQueries(
          // Only issue a request while the query has an enabled observer.
          { queryKey, exact: true, type: 'active' },
          // Reuse an in-flight fetch rather than restarting it.
          { cancelRefetch: false }
        )
        .then(schedule);
    }, interval);
  }

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (
      pausedUntilUpdate &&
      event.query.queryHash === queryHash &&
      event.type === 'updated'
    ) {
      pausedUntilUpdate = false;
      schedule();
    }
  });

  schedule();

  return {
    registrations,
    stop() {
      clearTimeout(timer);
      unsubscribe();
    },
  };
}

const pollersByClient = new WeakMap<QueryClient, Map<string, Poller>>();

function acquirePoller(
  queryClient: QueryClient,
  queryKey: QueryKey,
  registration: PollingRegistration
): () => void {
  let pollers = pollersByClient.get(queryClient);
  if (!pollers) {
    pollers = new Map();
    pollersByClient.set(queryClient, pollers);
  }
  const resolvedPollers = pollers;
  const queryHash = hashQueryKey(queryKey);

  const existingPoller = resolvedPollers.get(queryHash);
  const poller =
    existingPoller ??
    createPoller(queryClient, queryKey, queryHash, registration);
  if (existingPoller) {
    existingPoller.registrations.add(registration);
  } else {
    resolvedPollers.set(queryHash, poller);
  }

  return () => {
    poller.registrations.delete(registration);
    if (poller.registrations.size === 0) {
      poller.stop();
      resolvedPollers.delete(queryHash);
    }
  };
}

/**
 * Like `useQuery`, but keeps the query fresh by polling the backend at
 * `refetchInterval`. Any number of components can use the same polling query
 * simultaneously: react-query's own `refetchInterval` option runs a separate
 * refetch timer for every observer that sets it, and the resulting requests
 * only coalesce if they literally overlap, so N components polling one query
 * multiply the request rate N-fold. This hook instead drives all instances of
 * a query (per query client) with a single shared timer, so the request rate
 * is the same no matter how many components subscribe.
 *
 * When multiple instances are mounted, the interval of the earliest-mounted
 * instance wins, so bake the interval into the query's hook wrapper in
 * `api.ts` rather than accepting it from callers.
 */
export function usePollingQuery<T>(
  queryKey: QueryKey,
  queryFn: QueryFunction<T>,
  refetchInterval: PollingInterval<T>,
  options: Omit<UseQueryOptions<T>, 'refetchInterval'> = {}
): UseQueryResult<T> {
  const queryClient = useQueryClient();
  const queryHash = hashQueryKey(queryKey);

  // Give the polling loop access to the latest key and interval without
  // restarting it on every render (inline interval functions change identity
  // on each render).
  const pollingRef = useRef({ queryKey, refetchInterval });
  pollingRef.current = { queryKey, refetchInterval };

  useEffect(
    () =>
      acquirePoller(queryClient, pollingRef.current.queryKey, {
        getInterval() {
          const { queryKey: currentQueryKey, refetchInterval: interval } =
            pollingRef.current;
          return typeof interval === 'function'
            ? interval(queryClient.getQueryData(currentQueryKey))
            : interval;
        },
      }),
    [queryClient, queryHash]
  );

  return useQuery(queryKey, queryFn, options);
}
