import { BrowserRouter } from 'react-router-dom';

import { BaseLogger, LogSource } from '@votingworks/logging';
import { QueryClient } from '@tanstack/react-query';
import { AppErrorBoundary, VisualModeDisabledOverlay } from '@votingworks/ui';
import { AppRoot } from './app_root';
import { ApiClient, createApiClient, createQueryClient } from './api';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';
import { ApiProvider } from './api_provider';
import { MarkAppBase } from './mark_app_base';

window.oncontextmenu = (e: MouseEvent): void => {
  e.preventDefault();
};

export interface Props {
  logger?: BaseLogger;
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  enableStringTranslation?: boolean;
  noAudio?: boolean;
}

export function App({
  logger = new BaseLogger(LogSource.VxMarkFrontend, window.kiosk),
  /* istanbul ignore next - @preserve */ apiClient = createApiClient(),
  queryClient = createQueryClient(),
  enableStringTranslation,
  noAudio,
}: Props): JSX.Element {
  return (
    <MarkAppBase>
      <BrowserRouter>
        <AppErrorBoundary
          // Maintain the required parity with the hardware test app. But also use a longer delay
          // so that, in most cases, the user will still manually power down and power up rather
          // than relying on the auto-restart as the former is more likely to resolve issues than
          // the latter.
          autoRestartInSeconds={600}
          logger={logger}
          primaryMessage="Ask a poll worker to restart the ballot marking device."
        >
          <ApiProvider
            queryClient={queryClient}
            apiClient={apiClient}
            enableStringTranslation={enableStringTranslation}
            noAudio={noAudio}
          >
            <VisualModeDisabledOverlay />
            <AppRoot />
            <SessionTimeLimitTracker />
          </ApiProvider>
        </AppErrorBoundary>
      </BrowserRouter>
    </MarkAppBase>
  );
}
