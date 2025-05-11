import { QueryClientProvider } from '@tanstack/react-query';
import { AppErrorBoundary, FrontendLogger } from '@votingworks/ui';

import { ApiClientContext, createApiClient, createQueryClient } from './api';
import { AppRoot } from './app_root';
import { ScanAppBase } from '../scan_app_base';

export function App(): JSX.Element {
  const logger = new FrontendLogger();
  const queryClient = createQueryClient();
  const apiClient = createApiClient();

  return (
    <ScanAppBase>
      <AppErrorBoundary restartMessage="Restart the machine" logger={logger}>
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={queryClient}>
            <AppRoot />
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </AppErrorBoundary>
    </ScanAppBase>
  );
}
