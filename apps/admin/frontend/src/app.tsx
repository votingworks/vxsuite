import { ColorMode } from '@votingworks/types';
import { AppBase } from '@votingworks/ui';
import {
  getHardware,
  getPrinter,
  getConverterClientType,
} from '@votingworks/utils';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import './App.css';
import { AppRoot, Props as AppRootProps } from './app_root';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';

export type Props = Partial<AppRootProps>;

export function App({
  hardware = getHardware(),
  printer = getPrinter(),
  converter = getConverterClientType(),
  generateBallotId,
}: Props): JSX.Element {
  // Copied from old App.css
  const baseFontSizePx = 20;
  const printFontSizePx = 14;

  // TODO: Default to medium contrast and vary based on user selection.
  const colorMode: ColorMode = 'legacy';

  return (
    <BrowserRouter>
      <AppBase
        defaultColorMode={colorMode}
        legacyBaseFontSizePx={baseFontSizePx}
        legacyPrintFontSizePx={printFontSizePx}
      >
        <AppRoot
          printer={printer}
          hardware={hardware}
          converter={converter}
          generateBallotId={generateBallotId}
        />
        <SessionTimeLimitTracker />
      </AppBase>
    </BrowserRouter>
  );
}
