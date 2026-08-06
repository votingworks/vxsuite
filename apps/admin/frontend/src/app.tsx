import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BatteryLowAlert, LowDiskSpaceWarning } from '@votingworks/ui';
import './App.css';
import { AppRoot } from './app_root';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';
import { PrinterAlertWrapper } from './components/printer_alert_wrapper';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
} from './api';

const defaultApiClient = createApiClient();
const defaultQueryClient = createQueryClient();

export interface AppProps {
  apiClient?: ApiClient;
  queryClient?: QueryClient;
}

export function App({
  // @coverage-defer
  apiClient = defaultApiClient,
  // @coverage-defer
  queryClient = defaultQueryClient,
}: AppProps): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiClient}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoot />
          <SessionTimeLimitTracker />
          <LowDiskSpaceWarning />
          <BatteryLowAlert />
          <PrinterAlertWrapper />
        </BrowserRouter>
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}
