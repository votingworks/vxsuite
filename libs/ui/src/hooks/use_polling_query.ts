import { useEffect, useState } from 'react';
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

interface Registration {
  readonly enabled: boolean;
  setIsLeader(isLeader: boolean): void;
}

const registrationsByClient = new WeakMap<
  QueryClient,
  Map<string, Registration[]>
>();

/**
 * The leader — the one instance that passes `refetchInterval` through to
 * react-query — is the earliest-mounted instance that is enabled. If every
 * instance is disabled there is no leader, which is fine: react-query would
 * not poll a disabled observer anyway.
 */
function elect(registrations: Registration[]): void {
  const leader = registrations.find((registration) => registration.enabled);
  for (const registration of registrations) {
    registration.setIsLeader(registration === leader);
  }
}

function registerInstance(
  queryClient: QueryClient,
  queryHash: string,
  registration: Registration
): () => void {
  let registrationsByQuery = registrationsByClient.get(queryClient);
  if (!registrationsByQuery) {
    registrationsByQuery = new Map();
    registrationsByClient.set(queryClient, registrationsByQuery);
  }
  const registrations = registrationsByQuery.get(queryHash) ?? [];
  registrations.push(registration);
  registrationsByQuery.set(queryHash, registrations);
  elect(registrations);

  return () => {
    registrations.splice(registrations.indexOf(registration), 1);
    if (registrations.length === 0) {
      registrationsByQuery.delete(queryHash);
    } else {
      // Promote the next instance so polling continues when the leader
      // unmounts before its followers.
      elect(registrations);
    }
  };
}

/**
 * Like `useQuery`, but keeps the query fresh by polling the backend at
 * `refetchInterval`. Any number of components can use the same polling query
 * simultaneously: react-query runs a separate refetch timer for every
 * observer that sets `refetchInterval`, and the resulting requests only
 * coalesce if they literally overlap, so N components passing it to
 * `useQuery` directly multiply the request rate N-fold. This hook instead
 * elects a single instance per query (per query client) to pass
 * `refetchInterval` through to react-query — so react-query's own polling
 * implementation does all the work, but only one timer ever runs — and the
 * rest subscribe with no interval, receiving updates through the shared
 * query cache.
 *
 * When multiple instances are mounted, the interval of the elected instance
 * (the earliest-mounted one) wins, so bake the interval into the query's hook
 * wrapper in `api.ts` rather than accepting it from callers.
 */
export function usePollingQuery<T>(
  queryKey: QueryKey,
  queryFn: QueryFunction<T>,
  refetchInterval: PollingInterval<T>,
  options: Omit<UseQueryOptions<T>, 'refetchInterval'> = {}
): UseQueryResult<T> {
  const queryClient = useQueryClient();
  const queryHash = hashQueryKey(queryKey);
  const enabled = options.enabled !== false;
  const [isLeader, setIsLeader] = useState(false);

  useEffect(
    () => registerInstance(queryClient, queryHash, { enabled, setIsLeader }),
    [queryClient, queryHash, enabled]
  );

  return useQuery(queryKey, queryFn, {
    ...options,
    refetchInterval: isLeader ? refetchInterval : undefined,
  });
}
