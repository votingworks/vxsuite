import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import './i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  EnvironmentFlagName,
  isFeatureFlagEnabled,
  KioskStorage,
  LocalStorage,
} from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { App } from './app';
import { ElectionManagerStoreAdminBackend } from './lib/backends';
import { ServicesContext } from './contexts/services_context';

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { networkMode: 'always' },
    queries: { networkMode: 'always' },
  },
});
const storage = window.kiosk
  ? new KioskStorage(window.kiosk)
  : new LocalStorage();
const logger = new Logger(LogSource.VxAdminFrontend, window.kiosk);
const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

ReactDom.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ServicesContext.Provider value={{ backend, logger, storage }}>
        <App />
      </ServicesContext.Provider>
      {isFeatureFlagEnabled(
        EnvironmentFlagName.ENABLE_REACT_QUERY_DEVTOOLS
      ) && (
        <div className="no-print">
          <ReactQueryDevtools initialIsOpen={false} position="top-left" />
        </div>
      )}
    </QueryClientProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
