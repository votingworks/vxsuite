import './polyfills.js';
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
import { assert, throwIllegalValue } from '@votingworks/basics';
import { LogSource, BaseLogger } from '@votingworks/logging';
import { App as ServerApp } from './app.js';
import { ClientApp } from './client/client_app.js';
import { RestoreApp } from './restore/restore_app.js';
import { createApiClient } from './api.js';
import {
  SharedApiClientContext,
  createSharedQueryClient,
  getAppMode,
  isMultiStationAdjudicationEnabled,
  systemCallApi,
} from './shared_api.js';

function PrimaryApp(): JSX.Element | null {
  const appModeQuery = getAppMode.useQuery();
  const isMultiStationEnabledQuery =
    isMultiStationAdjudicationEnabled.useQuery();
  if (!appModeQuery.isSuccess || !isMultiStationEnabledQuery.isSuccess) {
    return null;
  }

  const appMode = appModeQuery.data;
  switch (appMode) {
    case 'restore': {
      return <RestoreApp />;
    }

    case 'client': {
      return isMultiStationEnabledQuery.data ? <ClientApp /> : <ServerApp />;
    }

    case 'host': {
      return <ServerApp />;
    }

    default: {
      throwIllegalValue(appMode);
    }
  }
}

const apiClient = createApiClient();
const queryClient = createSharedQueryClient();

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
        <SharedApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={queryClient}>
            <SystemCallContextProvider api={systemCallApi}>
              <PrimaryApp />
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
        </SharedApiClientContext.Provider>
      </AppErrorBoundary>
      <DevDock />
    </AppBase>
  </React.StrictMode>
);
