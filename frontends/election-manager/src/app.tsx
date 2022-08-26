import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';

import './App.css';

import {
  LocalStorage,
  KioskStorage,
  getPrinter,
  getHardware,
  WebServiceCard,
} from '@votingworks/utils';

import { AppRoot, Props as AppRootProps } from './app_root';
import { machineConfigProvider } from './utils/machine_config';
import { getConverterClientType } from './config/features';

export interface Props {
  storage?: AppRootProps['storage'];
  printer?: AppRootProps['printer'];
  hardware?: AppRootProps['hardware'];
  machineConfig?: AppRootProps['machineConfigProvider'];
  card?: AppRootProps['card'];
  converter?: AppRootProps['converter'];
}

const defaultStorage = window.kiosk
  ? new KioskStorage(window.kiosk)
  : new LocalStorage();

const queryClient = new QueryClient();

export function App({
  hardware,
  card = new WebServiceCard(),
  storage = defaultStorage,
  printer = getPrinter(),
  machineConfig = machineConfigProvider,
  converter = getConverterClientType(),
}: Props): JSX.Element {
  const [internalHardware, setInternalHardware] = useState(hardware);

  useEffect(() => {
    function updateHardware() {
      const newHardware = getHardware();
      setInternalHardware((prev) => prev ?? newHardware);
    }
    void updateHardware();
  });

  if (!internalHardware) {
    return <React.Fragment />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoot
          storage={storage}
          printer={printer}
          hardware={internalHardware}
          card={card}
          machineConfigProvider={machineConfig}
          converter={converter}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
