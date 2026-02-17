/* istanbul ignore file - @preserve */
import { QueryClientProvider } from '@tanstack/react-query';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  AppBase,
  AppErrorBoundary,
  SystemCallContextProvider,
} from '@votingworks/ui';

import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  ApiClientContext,
  createApiClient,
  createQueryClient,
  systemCallApi,
} from './api';
import { AppRoot } from './app_root';

export function App(): JSX.Element {
  const logger = new BaseLogger(LogSource.VxMarkFrontend, window.kiosk);
  const queryClient = createQueryClient();
  const apiClient = createApiClient();

  return (
    <AppBase
      defaultColorMode="contrastMedium"
      defaultSizeMode="touchSmall"
      hideCursor={isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.HIDE_CURSOR
      )}
      screenType="elo15"
    >
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
    </AppBase>
  );
}
