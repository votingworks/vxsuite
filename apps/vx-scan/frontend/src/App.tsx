import React, { useEffect, useRef, useState } from 'react';
import type { VxScanApi, Config } from '@votingworks/vx-scan-backend';
import grout from '@votingworks/grout';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query';
import { ScannerStatus } from '@votingworks/vx-scan-backend/build/server';

const apiClient = grout.createClient<VxScanApi>();

function useConfigQuery() {
  return useQuery(['config'], () => apiClient.queries.getConfig());
}

function useUpdateConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation(apiClient.mutations.updateConfig, {
    onSuccess: () => {
      queryClient.invalidateQueries(['config']);
    },
  });
}

function ConfigForm({ config }: { config: Config | undefined }) {
  const updateConfigMutation = useUpdateConfigMutation();
  const [formState, setFormState] = useState<Config>(
    config ?? { electionName: '', precinctName: '' }
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    updateConfigMutation.mutateAsync(formState);
  }

  return (
    <form onSubmit={submit}>
      <p>Election name: {config?.electionName}</p>
      <p>Precinct name: {config?.precinctName}</p>
      <p>
        <input
          type="text"
          value={formState.electionName}
          onChange={(event) =>
            setFormState((formState) => ({
              ...formState,
              electionName: event.target.value,
            }))
          }
        />
      </p>
      <p>
        <input
          type="text"
          value={formState.precinctName}
          onChange={(event) =>
            setFormState((formState) => ({
              ...formState,
              precinctName: event.target.value,
            }))
          }
        />
      </p>
      <p>
        <button type="submit">Save</button>
      </p>
    </form>
  );
}

function ConfigPanel() {
  const configQuery = useConfigQuery();

  if (!configQuery.isSuccess) return null;
  const config = configQuery.data;

  return (
    <div>
      <p>Config:</p>
      <ConfigForm config={config} />
    </div>
  );
}

function useScannerStatusQuery(
  options: UseQueryOptions<{ status: ScannerStatus }> = {}
) {
  return useQuery<{ status: ScannerStatus }>(
    ['scannerStatus'],
    () => apiClient.queries.getScannerStatus(),
    options
  );
}

function deepEqual(a: any, b: any) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Registers a handler that will be called whenever the result of a useQuery
 * hook changes (based on a deep equality check).
 *
 * Think of this like an event listener for events that are triggered via the
 * server (e.g. similar to how we can put an onChange handler on, say, a button,
 * for a user event that is triggered in the browser).
 *
 * It can be combined with the refetchInterval option of useQuery to make the
 * query poll for new data regularly.
 *
 * Example use cases:
 * - Playing a sound when the scanner accepts a ballot
 * - Redirecting to a new URL when a background task is complete
 */
function useQueryChangeListener<TData>(
  query: UseQueryResult<TData>,
  changeHandler: (newData: TData, previousData: TData | undefined) => void
) {
  const previousData = useRef<TData>();

  useEffect(() => {
    if (query.isSuccess && !deepEqual(previousData.current, query.data)) {
      changeHandler(query.data, previousData.current);
      previousData.current = query.data;
    }
  }, [query.data]);
}

function playSound() {
  console.log('Ding! Ballot accepted');
}

function ScannerStatusPanel() {
  const scannerStatusQuery = useScannerStatusQuery({
    refetchInterval: 1000,
  });

  useQueryChangeListener(scannerStatusQuery, (newStatus, previousStatus) => {
    if (
      previousStatus?.status === 'scanning' &&
      newStatus.status === 'accepted'
    ) {
      playSound();
    }
  });

  return (
    <div>
      <p>Scanner status: {scannerStatusQuery.data?.status}</p>
    </div>
  );
}

export function App(): JSX.Element | null {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <div>
        <h1>VxScan</h1>
        <ConfigPanel />
        <ScannerStatusPanel />
      </div>
    </QueryClientProvider>
  );
}
