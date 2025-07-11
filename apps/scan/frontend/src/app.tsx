import { BrowserRouter, Route } from 'react-router-dom';

import { BaseLogger, LogSource } from '@votingworks/logging';
import { QueryClient } from '@tanstack/react-query';
import { AppErrorBoundary, handleKeyboardEvent } from '@votingworks/ui';
import React from 'react';
import { AppRoot } from './app_root';
import { ApiClient, createApiClient, createQueryClient } from './api';
import { ScanAppBase } from './scan_app_base';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';
import { Paths } from './constants';
import { VoterSettingsScreen } from './screens/voter_settings_screen';
import { ApiProvider } from './api_provider';

export interface AppProps {
  logger?: BaseLogger;
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  enableStringTranslation?: boolean;
  noAudio?: boolean;
}

const RESTART_MESSAGE = 'Ask a poll worker to restart the scanner.';

export function App({
  logger = new BaseLogger(LogSource.VxScanFrontend, window.kiosk),
  apiClient = createApiClient(),
  queryClient = createQueryClient(),
  enableStringTranslation,
  noAudio,
}: AppProps): JSX.Element {
  // Handle navigation key events from the tactile controller/keyboard.
  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyboardEvent);
    return () => document.removeEventListener('keydown', handleKeyboardEvent);
  }, []);

  return (
    <ScanAppBase>
      <BrowserRouter>
        <AppErrorBoundary restartMessage={RESTART_MESSAGE} logger={logger}>
          <ApiProvider
            queryClient={queryClient}
            apiClient={apiClient}
            enableStringTranslation={enableStringTranslation}
            noAudio={noAudio}
          >
            <Route path={Paths.VOTER_SETTINGS} exact>
              <VoterSettingsScreen />
            </Route>
            <Route path={Paths.APP_ROOT} exact>
              <AppRoot />
            </Route>
            <SessionTimeLimitTracker />
          </ApiProvider>
        </AppErrorBoundary>
      </BrowserRouter>
    </ScanAppBase>
  );
}
