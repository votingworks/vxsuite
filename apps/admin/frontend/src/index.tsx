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
  FrontendLogger,
  SystemCallContextProvider,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { App } from './app';
import {
  ApiClientContext,
  createApiClient,
  createQueryClient,
  systemCallApi,
} from './api';

const apiClient = createApiClient();
const queryClient = createQueryClient();

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);
const logger = new FrontendLogger();

root.render(
  <React.StrictMode>
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      screenType="lenovoThinkpad15"
      showScrollBars
    >
      <AppErrorBoundary
        restartMessage="Please restart the machine."
        logger={logger}
      >
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={queryClient}>
            <SystemCallContextProvider api={systemCallApi}>
              <App />
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
