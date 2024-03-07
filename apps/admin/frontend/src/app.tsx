import { BrowserRouter } from 'react-router-dom';
import './App.css';
import { BatteryLowAlert } from '@votingworks/ui';
import { AppRoot } from './app_root';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';
import { PrinterAlert } from './components/printer_alert';

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AppRoot />
      <SessionTimeLimitTracker />
      <BatteryLowAlert />
      <PrinterAlert />
    </BrowserRouter>
  );
}
