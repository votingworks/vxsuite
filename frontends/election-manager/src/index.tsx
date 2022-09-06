import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import './i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KioskStorage, LocalStorage } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { App } from './app';
import { ElectionManagerStoreAdminBackend } from './lib/backends';

const queryClient = new QueryClient();
const storage = window.kiosk
  ? new KioskStorage(window.kiosk)
  : new LocalStorage();
const logger = new Logger(LogSource.VxAdminFrontend, window.kiosk);
const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

ReactDom.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App backend={backend} logger={logger} />
    </QueryClientProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
