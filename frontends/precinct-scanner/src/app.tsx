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
import { AppRoot, Props as AppRootProps } from './app_root';

import { machineConfigProvider } from './utils/machine_config';

export interface Props {
  hardware?: AppRootProps['hardware'];
  card?: AppRootProps['card'];
  machineConfig?: AppRootProps['machineConfig'];
  storage?: AppRootProps['storage'];
  logger?: AppRootProps['logger'];
}

export function App({
  hardware = getHardware(),
  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage(window.kiosk) : new LocalStorage(),
  machineConfig = machineConfigProvider,
  logger = new Logger(LogSource.VxPrecinctScanFrontend, window.kiosk),
}: Props): JSX.Element {
  return (
    <BrowserRouter>
      <AppRoot
        card={card}
        hardware={hardware}
        machineConfig={machineConfig}
        storage={storage}
        logger={logger}
      />
    </BrowserRouter>
  );
}
