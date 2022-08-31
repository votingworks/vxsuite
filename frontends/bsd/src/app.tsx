import React from 'react';
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
  hardware = getHardware(),
  card = new WebServiceCard(),
  logger = new Logger(LogSource.VxCentralScanFrontend, window.kiosk),
}: Props): JSX.Element {
  return (
    <BrowserRouter>
      <AppRoot hardware={hardware} card={card} logger={logger} />
    </BrowserRouter>
  );
}
