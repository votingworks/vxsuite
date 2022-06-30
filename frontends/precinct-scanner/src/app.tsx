import React, { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';

import './App.css';

import {
  WebServiceCard,
  KioskStorage,
  LocalStorage,
  getHardware,
  getPrinter,
} from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { AppRoot, Props as AppRootProps } from './app_root';

import { machineConfigProvider } from './utils/machine_config';

export interface Props {
  hardware?: AppRootProps['hardware'];
  printer?: AppRootProps['printer'];
  card?: AppRootProps['card'];
  machineConfig?: AppRootProps['machineConfig'];
  storage?: AppRootProps['storage'];
  logger?: AppRootProps['logger'];
}

export function App({
  hardware,
  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage(window.kiosk) : new LocalStorage(),
  printer = getPrinter(),
  machineConfig = machineConfigProvider,
  logger = new Logger(LogSource.VxPrecinctScanFrontend, window.kiosk),
}: Props): JSX.Element {
  const [internalHardware, setInternalHardware] = useState(hardware);
  useEffect(() => {
    const newInternalHardware = getHardware();
    setInternalHardware((prev) => prev ?? newInternalHardware);
  }, []);

  if (!internalHardware) {
    return <BrowserRouter />;
  }
  return (
    <BrowserRouter>
      <AppRoot
        card={card}
        hardware={internalHardware}
        printer={printer}
        machineConfig={machineConfig}
        storage={storage}
        logger={logger}
      />
    </BrowserRouter>
  );
}
