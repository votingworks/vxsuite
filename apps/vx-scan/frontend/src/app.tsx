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
import { AppRoot, Props as AppRootProps } from './app_root';

import { machineConfigProvider } from './utils/machine_config';
import { ApiClientContext } from './api/api';

export interface AppProps {
  hardware?: AppRootProps['hardware'];
  card?: AppRootProps['card'];
  machineConfig?: AppRootProps['machineConfig'];
  storage?: AppRootProps['storage'];
  logger?: AppRootProps['logger'];
  apiClient?: grout.Client<Api>;
}

export function App({
  hardware = getHardware(),
  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage(window.kiosk) : new LocalStorage(),
  machineConfig = machineConfigProvider,
  logger = new Logger(LogSource.VxScanFrontend, window.kiosk),
  apiClient = grout.createClient<Api>({ baseUrl: '/api' }),
}: AppProps): JSX.Element {
  return (
    <BrowserRouter>
      <ApiClientContext.Provider value={apiClient}>
        <AppRoot
          card={card}
          hardware={hardware}
          machineConfig={machineConfig}
          storage={storage}
          logger={logger}
        />
      </ApiClientContext.Provider>
    </BrowserRouter>
  );
}
