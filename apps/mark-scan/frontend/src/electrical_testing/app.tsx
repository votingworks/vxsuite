import { QueryClientProvider } from '@tanstack/react-query';
import { AppErrorBoundary, FrontendLogger } from '@votingworks/ui';

import { ApiClientContext, createApiClient, createQueryClient } from './api';
import { AppRoot } from './app_root';

export function App(): JSX.Element {
  const logger = new FrontendLogger();
  const queryClient = createQueryClient();
  const apiClient = createApiClient();

  return (
    <AppErrorBoundary restartMessage="Restart the machine" logger={logger}>
      <ApiClientContext.Provider value={apiClient}>
        <QueryClientProvider client={queryClient}>
          <AppRoot />
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </AppErrorBoundary>
  );
}
