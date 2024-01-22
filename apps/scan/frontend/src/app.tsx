import { BrowserRouter, Route } from 'react-router-dom';

import { Logger, LogSource } from '@votingworks/logging';
import { QueryClient } from '@tanstack/react-query';
import { AppErrorBoundary } from '@votingworks/ui';
import { AppRoot, Props as AppRootProps } from './app_root';
import { ApiClient, createApiClient, createQueryClient } from './api';
import { ScanAppBase } from './scan_app_base';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';
import { Paths } from './constants';
import { DisplaySettingsScreen } from './screens/display_settings_screen';
import { DisplaySettingsManager } from './components/display_settings_manager';
import { ApiProvider } from './api_provider';

export interface AppProps {
  logger?: AppRootProps['logger'];
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  enableStringTranslation?: boolean;
}

const RESTART_MESSAGE = 'Ask a poll worker to restart the scanner.';

export function App({
  logger = new Logger(LogSource.VxScanFrontend, window.kiosk),
  apiClient = createApiClient(),
  queryClient = createQueryClient(),
  enableStringTranslation,
}: AppProps): JSX.Element {
  return (
    <ScanAppBase>
      <BrowserRouter>
        <AppErrorBoundary restartMessage={RESTART_MESSAGE} logger={logger}>
          <ApiProvider
            queryClient={queryClient}
            apiClient={apiClient}
            enableStringTranslation={enableStringTranslation}
          >
            <AppErrorBoundary
              restartMessage={RESTART_MESSAGE}
              showRestartButton
              logger={logger}
            >
              <Route path={Paths.DISPLAY_SETTINGS} exact>
                <DisplaySettingsScreen />
              </Route>
              <Route path={Paths.APP_ROOT} exact>
                <AppRoot logger={logger} />
              </Route>
              <SessionTimeLimitTracker />
              <DisplaySettingsManager />
            </AppErrorBoundary>
          </ApiProvider>
        </AppErrorBoundary>
      </BrowserRouter>
    </ScanAppBase>
  );
}
