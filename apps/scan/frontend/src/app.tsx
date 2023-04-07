import React from 'react';
import { BrowserRouter } from 'react-router-dom';

import { getHardware } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CenteredLargeProse, ErrorBoundary, Text } from '@votingworks/ui';
import { AppRoot, Props as AppRootProps } from './app_root';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
} from './api';
import { TimesCircle } from './components/graphics';
import { ScanAppBase } from './scan_app_base';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';

export interface AppProps {
  hardware?: AppRootProps['hardware'];
  logger?: AppRootProps['logger'];
  apiClient?: ApiClient;
  queryClient?: QueryClient;
}

export function App({
  hardware = getHardware(),
  logger = new Logger(LogSource.VxScanFrontend, window.kiosk),
  apiClient = createApiClient(),
  queryClient = createQueryClient(),
}: AppProps): JSX.Element {
  return (
    <ScanAppBase>
      <BrowserRouter>
        <ErrorBoundary
          errorMessage={
            <React.Fragment>
              <TimesCircle />
              <CenteredLargeProse>
                <h1>Something went wrong</h1>
                <Text>Ask a poll worker to restart the scanner.</Text>
              </CenteredLargeProse>
            </React.Fragment>
          }
        >
          <ApiClientContext.Provider value={apiClient}>
            <QueryClientProvider client={queryClient}>
              <AppRoot hardware={hardware} logger={logger} />
              <SessionTimeLimitTracker />
            </QueryClientProvider>
          </ApiClientContext.Provider>
        </ErrorBoundary>
      </BrowserRouter>
    </ScanAppBase>
  );
}
