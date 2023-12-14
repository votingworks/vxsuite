import React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';

import {
  StringEnvironmentVariableName,
  getEnvironmentVariable,
  getHardware,
} from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Button,
  CenteredLargeProse,
  ErrorBoundary,
  FullScreenIconWrapper,
  H1,
  Icons,
  P,
  UiStringsContextProvider,
} from '@votingworks/ui';
import { PrecinctReportDestination } from '@votingworks/types';
import { assertDefined, Optional } from '@votingworks/basics';
import { AppRoot, Props as AppRootProps } from './app_root';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
  uiStringsApi,
} from './api';
import { ScanAppBase } from './scan_app_base';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';
import { Paths } from './constants';
import { DisplaySettingsScreen } from './screens/display_settings_screen';
import { DisplaySettingsManager } from './components/display_settings_manager';

const DEFAULT_PRECINCT_REPORT_DESTINATION: PrecinctReportDestination =
  'laser-printer';
const envPrecinctReportDestination = getEnvironmentVariable(
  StringEnvironmentVariableName.PRECINCT_REPORT_DESTINATION
) as Optional<PrecinctReportDestination>;

export interface AppProps {
  hardware?: AppRootProps['hardware'];
  logger?: AppRootProps['logger'];
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  precinctReportDestination?: PrecinctReportDestination;
  enableStringTranslation?: boolean;
}

export function App({
  hardware = getHardware(),
  logger = new Logger(LogSource.VxScanFrontend, window.kiosk),
  apiClient = createApiClient(),
  queryClient = createQueryClient(),
  precinctReportDestination = envPrecinctReportDestination ??
    DEFAULT_PRECINCT_REPORT_DESTINATION,
  enableStringTranslation,
}: AppProps): JSX.Element {
  return (
    <ScanAppBase>
      <BrowserRouter>
        <ErrorBoundary
          errorMessage={
            <React.Fragment>
              <FullScreenIconWrapper>
                <Icons.Delete color="danger" />
              </FullScreenIconWrapper>
              <CenteredLargeProse>
                <H1>Something went wrong</H1>
                <P>Ask a poll worker to restart the scanner.</P>
                <P>
                  <Button
                    onPress={() => assertDefined(window.kiosk).reboot()}
                    variant="primary"
                  >
                    Restart
                  </Button>
                </P>
              </CenteredLargeProse>
            </React.Fragment>
          }
          logger={logger}
        >
          <ApiClientContext.Provider value={apiClient}>
            <QueryClientProvider client={queryClient}>
              <UiStringsContextProvider
                api={uiStringsApi}
                disabled={!enableStringTranslation}
                noAudio
              >
                <Route path={Paths.DISPLAY_SETTINGS} exact>
                  <DisplaySettingsScreen />
                </Route>
                <Route path={Paths.APP_ROOT} exact>
                  <AppRoot
                    hardware={hardware}
                    logger={logger}
                    precinctReportDestination={precinctReportDestination}
                  />
                </Route>
                <SessionTimeLimitTracker />
                <DisplaySettingsManager />
              </UiStringsContextProvider>
            </QueryClientProvider>
          </ApiClientContext.Provider>
        </ErrorBoundary>
      </BrowserRouter>
    </ScanAppBase>
  );
}
