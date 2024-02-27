import { getPrinter, getConverterClientType } from '@votingworks/utils';
import { BrowserRouter } from 'react-router-dom';
import './App.css';
import { LogSource, BaseLogger } from '@votingworks/logging';
import { BatteryLowAlert } from '@votingworks/ui';
import { AppRoot, Props as AppRootProps } from './app_root';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';

export type Props = Partial<AppRootProps>;

export function App({
  printer = getPrinter(),
  converter = getConverterClientType(),
  logger = new BaseLogger(LogSource.VxAdminFrontend, window.kiosk),
  generateBallotId,
}: Props): JSX.Element {
  return (
    <BrowserRouter>
      <AppRoot
        printer={printer}
        converter={converter}
        generateBallotId={generateBallotId}
        logger={logger}
      />
      <SessionTimeLimitTracker />
      <BatteryLowAlert />
    </BrowserRouter>
  );
}
