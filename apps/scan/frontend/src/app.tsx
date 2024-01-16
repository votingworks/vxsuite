import React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';

import { getHardware } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { QueryClient } from '@tanstack/react-query';
import {
  Button,
  CenteredLargeProse,
  ErrorBoundary,
  FullScreenIconWrapper,
  H1,
  Icons,
  P,
} from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';
import { AppRoot, Props as AppRootProps } from './app_root';
import { ApiClient, createApiClient, createQueryClient } from './api';
import { ScanAppBase } from './scan_app_base';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';
import { Paths } from './constants';
import { DisplaySettingsScreen } from './screens/display_settings_screen';
import { DisplaySettingsManager } from './components/display_settings_manager';
import { ApiProvider } from './api_provider';

export interface AppProps {
  hardware?: AppRootProps['hardware'];
  logger?: AppRootProps['logger'];
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  enableStringTranslation?: boolean;
}

export function App({
  hardware = getHardware(),
  logger = new Logger(LogSource.VxScanFrontend, window.kiosk),
  apiClient = createApiClient(),
  queryClient = createQueryClient(),
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
          <ApiProvider
            queryClient={queryClient}
            apiClient={apiClient}
            enableStringTranslation={enableStringTranslation}
          >
            <Route path={Paths.DISPLAY_SETTINGS} exact>
              <DisplaySettingsScreen />
            </Route>
            <Route path={Paths.APP_ROOT} exact>
              <AppRoot hardware={hardware} logger={logger} />
            </Route>
            <SessionTimeLimitTracker />
            <DisplaySettingsManager />
          </ApiProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </ScanAppBase>
  );
}
