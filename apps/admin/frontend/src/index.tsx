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
import { LogSource, Logger } from '@votingworks/logging';
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
const logger = new Logger(LogSource.VxAdminFrontend, window.kiosk);

root.render(
  <React.StrictMode>
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      screenType="lenovoThinkpad15"
    >
      {/* TODO: Move these wrappers down a level into <App> so that we can 1) test the ErrorBoundary
      and 2) be more consistent with other Vx apps. This will require updating test utils to not
      render their own providers when rendering <App> */}
      <AppErrorBoundary
        restartMessage="Please restart the machine."
        logger={logger}
      >
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={queryClient}>
            <SystemCallContextProvider api={systemCallApi}>
              <App logger={logger} />
              {isFeatureFlagEnabled(
                BooleanEnvironmentVariableName.ENABLE_REACT_QUERY_DEVTOOLS
              ) && (
                <div className="no-print">
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
