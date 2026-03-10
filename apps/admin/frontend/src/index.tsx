import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { DevDock } from '@votingworks/dev-dock-frontend';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  AppBase,
  AppErrorBoundary,
  SystemCallContextProvider,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { LogSource, BaseLogger } from '@votingworks/logging';
import { App } from './app';
import { ClientApp } from './client/client_app';
import {
  ApiClientContext,
  createApiClient,
  createQueryClient,
  getMachineMode,
  systemCallApi,
} from './api';

function RootApp(): JSX.Element | null {
  const machineModeQuery = getMachineMode.useQuery();
  if (!machineModeQuery.isSuccess) {
    return null;
  }
  if (
    machineModeQuery.data === 'client' &&
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
    )
  ) {
    return <ClientApp />;
  }
  return <App />;
}

const apiClient = createApiClient();
const queryClient = createQueryClient();

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);
const logger = new BaseLogger(LogSource.VxAdminFrontend, window.kiosk);

root.render(
  <React.StrictMode>
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      screenType="lenovoThinkpad15"
      showScrollBars
    >
      <AppErrorBoundary logger={logger}>
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={queryClient}>
            <SystemCallContextProvider api={systemCallApi}>
              <RootApp />
              {isFeatureFlagEnabled(
                BooleanEnvironmentVariableName.ENABLE_REACT_QUERY_DEVTOOLS
              ) && (
                <div>
                  <ReactQueryDevtools
                    initialIsOpen={false}
                    position="top-left"
                  />
                </div>
              )}
            </SystemCallContextProvider>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </AppErrorBoundary>
      <DevDock />
    </AppBase>
  </React.StrictMode>
);
