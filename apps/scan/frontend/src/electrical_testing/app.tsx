import { QueryClientProvider } from '@tanstack/react-query';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  AppBase,
  AppErrorBoundary,
  SystemCallContextProvider,
} from '@votingworks/ui';

import {
  ApiClientContext,
  createApiClient,
  createQueryClient,
  systemCallApi,
} from './api';
import { AppRoot } from './app_root';
import { ScanAppBase } from '../scan_app_base';

export function App(): JSX.Element {
  const logger = new BaseLogger(LogSource.VxScanFrontend, window.kiosk);
  const queryClient = createQueryClient();
  const apiClient = createApiClient();

  return (
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      showScrollBars
    >
      <AppErrorBoundary restartMessage="Restart the machine" logger={logger}>
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={queryClient}>
            <SystemCallContextProvider api={systemCallApi}>
              <AppRoot />
            </SystemCallContextProvider>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </AppErrorBoundary>
    </AppBase>
  );
}
