import { useCancelablePromise } from '@votingworks/ui';
import {
  getHardware,
  KioskStorage,
  LocalStorage,
  WebServiceCard,
} from '@votingworks/utils';
import React, { useEffect, useState } from 'react';
import './App.css';
import AppRoot, { Props as AppRootProps } from './AppRoot';

export type Props = Partial<AppRootProps>;

function App({
  hardware,
  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage(window.kiosk) : new LocalStorage(),
}: Props): JSX.Element {
  const [internalHardware, setInternalHardware] = useState(hardware);
  const makeCancelable = useCancelablePromise();
  useEffect(() => {
    async function updateHardware() {
      const newInternalHardware = await makeCancelable(getHardware());
      setInternalHardware((prev) => prev ?? newInternalHardware);
    }
    void updateHardware();
  }, [makeCancelable]);

  if (!internalHardware) {
    return <React.Fragment />;
  }

  return <AppRoot card={card} hardware={internalHardware} storage={storage} />;
}

export default App;
