import React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';

import { getHardware } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  CenteredLargeProse,
  ErrorBoundary,
  FullScreenIconWrapper,
  H1,
  Icons,
  P,
} from '@votingworks/ui';
import { AppRoot, Props as AppRootProps } from './app_root';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
} from './api';
import { ScanAppBase } from './scan_app_base';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';
import { Paths } from './constants';
import { DisplaySettingsScreen } from './screens/display_settings_screen';

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
              <FullScreenIconWrapper color="danger">
                <Icons.DangerX />
              </FullScreenIconWrapper>
              <CenteredLargeProse>
                <H1>Something went wrong</H1>
                <P>Ask a poll worker to restart the scanner.</P>
              </CenteredLargeProse>
            </React.Fragment>
          }
        >
          <ApiClientContext.Provider value={apiClient}>
            <QueryClientProvider client={queryClient}>
              <Route path={Paths.DISPLAY_SETTINGS} exact>
                <DisplaySettingsScreen />
              </Route>
              <Route path={Paths.APP_ROOT} exact>
                <AppRoot hardware={hardware} logger={logger} />
              </Route>
              <SessionTimeLimitTracker />
            </QueryClientProvider>
          </ApiClientContext.Provider>
        </ErrorBoundary>
      </BrowserRouter>
    </ScanAppBase>
  );
}
