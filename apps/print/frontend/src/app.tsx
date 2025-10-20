import './polyfills';
import { AppBase, AppErrorBoundary } from '@votingworks/ui';
import { BrowserRouter } from 'react-router-dom';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { MachineLockedScreen } from './machine_locked_screen';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AppRoot({ logger }: { logger: BaseLogger }): JSX.Element | null {
  return <MachineLockedScreen />;
}

export function App(): JSX.Element {
  const logger = new BaseLogger(LogSource.VxPrintFrontend, window.kiosk);

  return (
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      screenType="lenovoThinkpad15"
      showScrollBars
    >
      <AppErrorBoundary
        restartMessage="Please restart the machine."
        logger={logger}
      >
        <BrowserRouter>
          <AppRoot logger={logger} />
        </BrowserRouter>
      </AppErrorBoundary>
      <DevDock />
    </AppBase>
  );
}
