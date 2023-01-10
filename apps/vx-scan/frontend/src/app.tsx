import React from 'react';
import { BrowserRouter } from 'react-router-dom';

import './App.css';

import {
  WebServiceCard,
  KioskStorage,
  LocalStorage,
  getHardware,
} from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import * as grout from '@votingworks/grout';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { Api } from '@votingworks/vx-scan-backend';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoot, Props as AppRootProps } from './app_root';

import { machineConfigProvider } from './utils/machine_config';
import { ApiClientContext, queryClientDefaultOptions } from './api';

export interface AppProps {
  hardware?: AppRootProps['hardware'];
  card?: AppRootProps['card'];
  machineConfig?: AppRootProps['machineConfig'];
  storage?: AppRootProps['storage'];
  logger?: AppRootProps['logger'];
  apiClient?: grout.Client<Api>;
  queryClient?: QueryClient;
}

export function App({
  hardware = getHardware(),
  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage(window.kiosk) : new LocalStorage(),
  machineConfig = machineConfigProvider,
  logger = new Logger(LogSource.VxScanFrontend, window.kiosk),
  apiClient = grout.createClient<Api>({ baseUrl: '/api' }),
  queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions }),
}: AppProps): JSX.Element {
  return (
    <BrowserRouter>
      <ApiClientContext.Provider value={apiClient}>
        <QueryClientProvider client={queryClient}>
          <AppRoot
            card={card}
            hardware={hardware}
            machineConfig={machineConfig}
            storage={storage}
            logger={logger}
          />
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </BrowserRouter>
  );
}
