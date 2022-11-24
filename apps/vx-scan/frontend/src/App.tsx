import React, { useEffect, useState } from 'react';
import type { VxScanApi, Config } from '@votingworks/vx-scan-backend';
import grout from '@votingworks/grout';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

const apiClient = grout.createClient<VxScanApi>();

const useConfigQuery = () =>
  useQuery(['config'], () => apiClient.queries.getConfig());

const useUpdateConfigMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(apiClient.mutations.updateConfig, {
    onSuccess: () => {
      queryClient.invalidateQueries(['config']);
    },
  });
};

function ConfigForm({ config }: { config: Config | undefined }) {
  const updateConfigMutation = useUpdateConfigMutation();
  console.log({ config });
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

export function App(): JSX.Element | null {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <div>
        <h1>VxScan</h1>
        <ConfigPanel />
      </div>
    </QueryClientProvider>
  );
}
