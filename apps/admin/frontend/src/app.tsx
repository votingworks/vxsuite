import { BrowserRouter } from 'react-router-dom';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BatteryLowAlert, LowDiskSpaceWarning } from '@votingworks/ui';
import { AppRoot } from './app_root.js';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker.js';
import { PrinterAlertWrapper } from './components/printer_alert_wrapper.js';
import {
  type ApiClient,
  ApiClientContext,
  createApiClient,
  createElectionDefinitionApiClient,
  createQueryClient,
  type ElectionDefinitionApiClient,
  ElectionDefinitionApiClientContext,
} from './api.js';

const defaultApiClient = createApiClient();
const defaultElectionDefinitionApiClient = createElectionDefinitionApiClient();
const defaultQueryClient = createQueryClient();

export interface AppProps {
  apiClient?: ApiClient;
  electionDefinitionApiClient?: ElectionDefinitionApiClient;
  queryClient?: QueryClient;
}

export function App({
  // @coverage-defer
  apiClient = defaultApiClient,
  // @coverage-defer
  electionDefinitionApiClient = defaultElectionDefinitionApiClient,
  // @coverage-defer
  queryClient = defaultQueryClient,
}: AppProps): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiClient}>
      <ElectionDefinitionApiClientContext.Provider
        value={electionDefinitionApiClient}
      >
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRoot />
            <SessionTimeLimitTracker />
            <LowDiskSpaceWarning />
            <BatteryLowAlert />
            <PrinterAlertWrapper />
          </BrowserRouter>
        </QueryClientProvider>
      </ElectionDefinitionApiClientContext.Provider>
    </ApiClientContext.Provider>
  );
}
