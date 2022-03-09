import React, { useEffect, useState } from 'react';
import { BrowserRouter, Route } from 'react-router-dom';

import './App.css';

import {
  WebServiceCard,
  KioskStorage,
  LocalStorage,
  getHardware,
  getPrinter,
} from '@votingworks/utils';
import { AppRoot, Props as AppRootProps } from './app_root';

import { machineConfigProvider } from './utils/machine_config';

export interface Props {
  hardware?: AppRootProps['hardware'];
  printer?: AppRootProps['printer'];
  card?: AppRootProps['card'];
  machineConfig?: AppRootProps['machineConfig'];
  storage?: AppRootProps['storage'];
}

export function App({
  hardware,
  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage(window.kiosk) : new LocalStorage(),
  printer = getPrinter(),
  machineConfig = machineConfigProvider,
}: Props): JSX.Element {
  const [internalHardware, setInternalHardware] = useState(hardware);
  useEffect(() => {
    function updateHardware() {
      const newInternalHardware = getHardware();
      setInternalHardware((prev) => prev ?? newInternalHardware);
    }
    void updateHardware();
  });

  if (!internalHardware) {
    return <BrowserRouter />;
  }
  return (
    <BrowserRouter>
      <Route
        path="/"
        render={(props) => (
          <AppRoot
            card={card}
            hardware={internalHardware}
            printer={printer}
            machineConfig={machineConfig}
            storage={storage}
            {...props}
          />
        )}
      />
    </BrowserRouter>
  );
}
