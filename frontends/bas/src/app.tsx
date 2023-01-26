import { ColorMode } from '@votingworks/types';
import { AppBase } from '@votingworks/ui';
import {
  getHardware,
  KioskStorage,
  LocalStorage,
  WebServiceCard,
} from '@votingworks/utils';
import React from 'react';
import { AppRoot, Props as AppRootProps } from './app_root';

export type Props = Partial<AppRootProps>;

export function App({
  hardware = getHardware(),
  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage(window.kiosk) : new LocalStorage(),
}: Props): JSX.Element {
  // Copied from old App.css
  const baseFontSizePx = 48;

  // TODO: Default to medium contrast and vary based on user selection.
  const colorMode: ColorMode = 'legacy';

  return (
    <AppBase colorMode={colorMode} legacyBaseFontSizePx={baseFontSizePx}>
      <AppRoot card={card} hardware={hardware} storage={storage} />
    </AppBase>
  );
}
