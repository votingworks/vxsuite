# Disallow react-query's `refetchInterval` option (`vx/no-refetch-interval`)

react-query runs a separate refetch timer for every observer that sets a
`refetchInterval` — whether in a `useQuery` call or in a query client's default
options — and the resulting requests only coalesce if they literally overlap. So
N components subscribing to one polled query multiply the request rate to the
backend N-fold (e.g. 4 components × `refetchInterval: 1000` = 4 requests per
second).

Use `usePollingQuery` from `@votingworks/ui` instead. It drives all instances of
a query (per query client) with a single shared timer, so the request rate stays
the same no matter how many components subscribe.

## Rule Details

Examples of **incorrect** code for this rule:

```ts
useQuery(queryKey, queryFn, { refetchInterval: 1000 });

new QueryClient({
  defaultOptions: { queries: { refetchInterval: 1000 } },
});
```

Examples of **correct** code for this rule:

```ts
import { usePollingQuery } from '@votingworks/ui';

usePollingQuery(queryKey, queryFn, 1000);

// Function intervals are supported too; return `false` to pause polling
// until the query's data next changes
usePollingQuery(queryKey, queryFn, (data) => (data?.isEnabled ? 1000 : false));
```

## When Not To Use It

This rule is currently opt-in per package: apps that have not yet migrated their
polled queries to `usePollingQuery` (e.g. VxScan, VxPollBook) should enable it
as part of that migration.
