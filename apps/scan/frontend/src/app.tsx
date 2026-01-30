import { BrowserRouter, Route } from 'react-router-dom';

import { BaseLogger, LogSource } from '@votingworks/logging';
import { QueryClient } from '@tanstack/react-query';
import { AppErrorBoundary, VisualModeDisabledOverlay } from '@votingworks/ui';
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

export function App({
  logger = new BaseLogger(LogSource.VxScanFrontend, window.kiosk),
  apiClient = createApiClient(),
  queryClient = createQueryClient(),
  enableStringTranslation,
  noAudio,
}: AppProps): JSX.Element {
  // Note: Keyboard navigation for PAT devices is handled in app_root.tsx
  // with support for PAT device calibration flow.

  return (
    <ScanAppBase>
      <BrowserRouter>
        <AppErrorBoundary
          // Maintain the required parity with the hardware test app. But also use a longer delay
          // so that, in most cases, the user will still manually power down and power up rather
          // than relying on the auto-restart as the former is more likely to resolve issues than
          // the latter.
          autoRestartInSeconds={10}
          logger={logger}
          primaryMessage="Ask a poll worker to restart the scanner."
        >
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
            <VisualModeDisabledOverlay />
            <SessionTimeLimitTracker />
          </ApiProvider>
        </AppErrorBoundary>
      </BrowserRouter>
    </ScanAppBase>
  );
}
