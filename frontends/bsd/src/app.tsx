import React, { useEffect, useState } from 'react';
import { WebServiceCard, getHardware } from '@votingworks/utils';
import { BrowserRouter, Route } from 'react-router-dom';

import './App.css';

import { AppRoot, AppRootProps } from './app_root';

export interface Props {
  card?: AppRootProps['card'];
  hardware?: AppRootProps['hardware'];
}

export function App({
  hardware,
  card = new WebServiceCard(),
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
  return (
    <BrowserRouter>
      <Route path="/">
        <AppRoot hardware={internalHardware} card={card} />
      </Route>
    </BrowserRouter>
  );
}
