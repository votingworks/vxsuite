import {
  getHardware,
  KioskStorage,
  LocalStorage,
  WebServiceCard,
} from '@votingworks/utils';
import React, { useEffect, useState } from 'react';
import './App.css';
import { AppRoot, Props as AppRootProps } from './app_root';

export type Props = Partial<AppRootProps>;

export function App({
  hardware,
  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage(window.kiosk) : new LocalStorage(),
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
    return <React.Fragment />;
  }

  return <AppRoot card={card} hardware={internalHardware} storage={storage} />;
}
