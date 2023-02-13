import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import './i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  KioskStorage,
  LocalStorage,
} from '@votingworks/shared';
import { Logger, LogSource } from '@votingworks/logging';
import { ErrorBoundary, Prose, Text } from '@votingworks/shared-frontend';
import { App } from './app';
import { ElectionManagerStoreAdminBackend } from './lib/backends';
import { ServicesContext } from './contexts/services_context';
import { ApiClientContext, createApiClient, createQueryClient } from './api';

const storage = window.kiosk
  ? new KioskStorage(window.kiosk)
  : new LocalStorage();
const logger = new Logger(LogSource.VxAdminFrontend, window.kiosk);
const backend = new ElectionManagerStoreAdminBackend({ storage, logger });
const apiClient = createApiClient();
const queryClient = createQueryClient();

ReactDom.render(
  <React.StrictMode>
    {/* TODO: Move these wrappers down a level into <App> so that we can 1) test the ErrorBoundary
      and 2) be more consistent with other Vx apps. This will require updating test utils to not
      render their own providers when rendering <App> */}
    <ErrorBoundary
      errorMessage={
        <Prose textCenter>
          <h1>Something went wrong</h1>
          <Text>Please restart the machine.</Text>
        </Prose>
      }
    >
      <ServicesContext.Provider value={{ backend, logger, storage }}>
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </ServicesContext.Provider>
    </ErrorBoundary>
    {isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_REACT_QUERY_DEVTOOLS
    ) && (
      <div className="no-print">
        <ReactQueryDevtools initialIsOpen={false} position="top-left" />
      </div>
    )}
  </React.StrictMode>,
  document.getElementById('root')
);
