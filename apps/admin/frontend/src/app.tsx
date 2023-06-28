import {
  getHardware,
  getPrinter,
  getConverterClientType,
} from '@votingworks/utils';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import './App.css';
import { LogSource, Logger } from '@votingworks/logging';
import { AppRoot, Props as AppRootProps } from './app_root';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';

export type Props = Partial<AppRootProps>;

export function App({
  hardware = getHardware(),
  printer = getPrinter(),
  converter = getConverterClientType(),
  logger = new Logger(LogSource.VxAdminFrontend, window.kiosk),
  generateBallotId,
}: Props): JSX.Element {
  return (
    <BrowserRouter>
      <AppRoot
        printer={printer}
        hardware={hardware}
        converter={converter}
        generateBallotId={generateBallotId}
        logger={logger}
      />
      <SessionTimeLimitTracker />
    </BrowserRouter>
  );
}
