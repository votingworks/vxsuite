/* istanbul ignore file - @preserve */
import { QueryClientProvider } from '@tanstack/react-query';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { AppErrorBoundary, SystemCallContextProvider } from '@votingworks/ui';

import {
  ApiClientContext,
  createApiClient,
  createQueryClient,
  systemCallApi,
} from './api';
import { AppRoot } from './app_root';
import { MarkAppBase } from '../mark_app_base';

export function App(): JSX.Element {
  const logger = new BaseLogger(LogSource.VxMarkFrontend, window.kiosk);
  const queryClient = createQueryClient();
  const apiClient = createApiClient();

  return (
    <MarkAppBase>
      <AppErrorBoundary
        autoRestartInSeconds={10}
        logger={logger}
        secondaryMessage="The machine will auto-restart in 10 seconds."
      >
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={queryClient}>
            <SystemCallContextProvider api={systemCallApi}>
              <AppRoot />
            </SystemCallContextProvider>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </AppErrorBoundary>
    </MarkAppBase>
  );
}
