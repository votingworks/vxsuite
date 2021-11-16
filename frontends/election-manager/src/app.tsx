import React, { useEffect, useState } from 'react';
import { BrowserRouter, Route } from 'react-router-dom';

import './App.css';

import { useCancelablePromise } from '@votingworks/ui';
import {
  LocalStorage,
  KioskStorage,
  getPrinter,
  getHardware,
  WebServiceCard,
} from '@votingworks/utils';

import { AppRoot, Props as AppRootProps } from './app_root';
import { machineConfigProvider } from './utils/machine_config';

export interface Props {
  storage?: AppRootProps['storage'];
  printer?: AppRootProps['printer'];
  hardware?: AppRootProps['hardware'];
  machineConfig?: AppRootProps['machineConfigProvider'];
  card?: AppRootProps['card'];
}

const defaultStorage = window.kiosk
  ? new KioskStorage(window.kiosk)
  : new LocalStorage();

export function App({
  hardware,
  card = new WebServiceCard(),
  storage = defaultStorage,
  printer = getPrinter(),
  machineConfig = machineConfigProvider,
}: Props): JSX.Element {
  const [internalHardware, setInternalHardware] = useState(hardware);
  const makeCancelable = useCancelablePromise();

  useEffect(() => {
    async function updateHardware() {
      const newHardware = await makeCancelable(getHardware());
      setInternalHardware((prev) => prev ?? newHardware);
    }
    void updateHardware();
  }, [makeCancelable]);

  if (!internalHardware) {
    return <React.Fragment />;
  }

  return (
    <BrowserRouter>
      <Route
        path="/"
        render={(props) => (
          <AppRoot
            storage={storage}
            printer={printer}
            hardware={internalHardware}
            card={card}
            machineConfigProvider={machineConfig}
            {...props}
          />
        )}
      />
    </BrowserRouter>
  );
}
