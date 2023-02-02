import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import './i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  KioskStorage,
  LocalStorage,
} from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import {
  ErrorBoundary,
  Prose,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  Text,
} from '@votingworks/ui';
import { App } from './app';
import { ElectionManagerStoreAdminBackend } from './lib/backends';
import { ServicesContext } from './contexts/services_context';
import { ApiClientContext, createApiClient } from './api';

const storage = window.kiosk
  ? new KioskStorage(window.kiosk)
  : new LocalStorage();
const logger = new Logger(LogSource.VxAdminFrontend, window.kiosk);
const backend = new ElectionManagerStoreAdminBackend({ storage, logger });
const apiClient = createApiClient();
const queryClient = new QueryClient({
  defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
});

ReactDom.render(
  <React.StrictMode>
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
