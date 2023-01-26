import React from 'react';
import { WebServiceCard, getHardware } from '@votingworks/utils';
import { BrowserRouter } from 'react-router-dom';

import { Logger, LogSource } from '@votingworks/logging';
import { ColorMode } from '@votingworks/types';
import { AppBase } from '@votingworks/ui';
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
  // Copied from old App.css
  const baseFontSizePx = 24;

  // TODO: Default to medium contrast and vary based on user selection.
  const colorMode: ColorMode = 'legacy';

  return (
    <BrowserRouter>
      <AppBase colorMode={colorMode} legacyBaseFontSizePx={baseFontSizePx}>
        <AppRoot hardware={hardware} card={card} logger={logger} />
      </AppBase>
    </BrowserRouter>
  );
}
