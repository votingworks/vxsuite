import React, { useEffect, useState } from 'react';
import { WebServiceCard, getHardware } from '@votingworks/utils';
import { BrowserRouter } from 'react-router-dom';

import './App.css';

import { AppRoot, AppRootProps } from './app_root';
import { isAuthenticationEnabled } from './config/features';

export interface Props {
  card?: AppRootProps['card'];
  hardware?: AppRootProps['hardware'];
  bypassAuthentication?: AppRootProps['bypassAuthentication'];
}

export function App({
  hardware,
  card = new WebServiceCard(),
  bypassAuthentication = !isAuthenticationEnabled(),
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
      <AppRoot
        hardware={internalHardware}
        card={card}
        bypassAuthentication={bypassAuthentication}
      />
    </BrowserRouter>
  );
}
