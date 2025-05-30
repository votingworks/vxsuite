import { QueryClientProvider } from '@tanstack/react-query';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { AppErrorBoundary } from '@votingworks/ui';

import { ApiClientContext, createApiClient, createQueryClient } from './api';
import { AppRoot } from './app_root';
import { MarkScanAppBase } from '../mark_scan_app_base';

export function App(): JSX.Element {
  const logger = new BaseLogger(LogSource.VxScanFrontend, window.kiosk);
  const queryClient = createQueryClient();
  const apiClient = createApiClient();

  return (
    <MarkScanAppBase>
      <AppErrorBoundary restartMessage="Restart the machine" logger={logger}>
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={queryClient}>
            <AppRoot />
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </AppErrorBoundary>
    </MarkScanAppBase>
  );
}
