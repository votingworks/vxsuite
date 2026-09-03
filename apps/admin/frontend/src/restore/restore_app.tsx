import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RestoreAppRoot } from './restore_app_root.js';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
} from './api.js';
import { SharedApiClientContext } from '../shared_api.js';

export interface RestoreAppProps {
  apiClient?: ApiClient;
  queryClient?: QueryClient;
}

/**
 * The app a VxAdmin serves when it has been booted into restore mode: nothing
 * but what it takes to restore a backup and restart.
 */
export function RestoreApp({
  apiClient,
  // @coverage-defer
  queryClient = createQueryClient(),
}: RestoreAppProps): JSX.Element {
  // @coverage-defer
  const resolvedApiClient = apiClient ?? createApiClient();
  return (
    <ApiClientContext.Provider value={resolvedApiClient}>
      <SharedApiClientContext.Provider value={resolvedApiClient}>
        <QueryClientProvider client={queryClient}>
          <RestoreAppRoot />
        </QueryClientProvider>
      </SharedApiClientContext.Provider>
    </ApiClientContext.Provider>
  );
}
