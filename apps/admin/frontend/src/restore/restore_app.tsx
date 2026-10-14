import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BatteryLowAlert, LowDiskSpaceWarning } from '@votingworks/ui';
import { RestoreAppRoot } from './restore_app_root.js';
import {
  type ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
} from './api.js';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker.js';
import { SharedApiClientContext } from '../shared_api.js';

const defaultApiClient = createApiClient();
const defaultQueryClient = createQueryClient();

export interface RestoreAppProps {
  apiClient?: ApiClient;
  queryClient?: QueryClient;
}

export function RestoreApp({
  // @coverage-exclude: always injected in tests
  apiClient = defaultApiClient,
  // @coverage-exclude: always injected in tests
  queryClient = defaultQueryClient,
}: RestoreAppProps): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiClient}>
      <SharedApiClientContext.Provider value={apiClient}>
        <QueryClientProvider client={queryClient}>
          <RestoreAppRoot />
          <SessionTimeLimitTracker />
          <LowDiskSpaceWarning />
          <BatteryLowAlert />
        </QueryClientProvider>
      </SharedApiClientContext.Provider>
    </ApiClientContext.Provider>
  );
}
