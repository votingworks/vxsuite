import React, { useEffect, useState } from 'react';
import { WebServiceCard, getHardware } from '@votingworks/utils';
import { BrowserRouter, Route } from 'react-router-dom';

import './App.css';

import { AppRoot, AppRootProps } from './AppRoot';

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
    async function updateHardware() {
      if (internalHardware === undefined) {
        setInternalHardware(await getHardware());
      }
    }
    void updateHardware();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardware]);

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
