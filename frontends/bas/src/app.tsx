import {
  getHardware,
  KioskStorage,
  LocalStorage,
  WebServiceCard,
} from '@votingworks/utils';
import React from 'react';
import './App.css';
import { AppRoot, Props as AppRootProps } from './app_root';

export type Props = Partial<AppRootProps>;

export function App({
  hardware = getHardware(),
  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage(window.kiosk) : new LocalStorage(),
}: Props): JSX.Element {
  return <AppRoot card={card} hardware={hardware} storage={storage} />;
}
