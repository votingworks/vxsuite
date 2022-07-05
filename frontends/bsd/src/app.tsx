import React, { useEffect, useState } from 'react';
import { WebServiceCard, getHardware } from '@votingworks/utils';
import { BrowserRouter } from 'react-router-dom';

import './App.css';

import { Logger, LogSource } from '@votingworks/logging';
import { AppRoot, AppRootProps } from './app_root';

export interface Props {
  card?: AppRootProps['card'];
  hardware?: AppRootProps['hardware'];
  logger?: AppRootProps['logger'];
}

export function App({
  hardware,
  card = new WebServiceCard(),
  logger = new Logger(LogSource.VxCentralScanFrontend, window.kiosk),
}: Props): JSX.Element {
  const [internalHardware, setInternalHardware] = useState(hardware);
  useEffect(() => {
    const newInternalHardware = getHardware();
    setInternalHardware((prev) => prev ?? newInternalHardware);
  }, []);

  if (!internalHardware) {
    return <React.Fragment />;
  }

  return (
    <BrowserRouter>
      <AppRoot hardware={internalHardware} card={card} logger={logger} />
    </BrowserRouter>
  );
}
