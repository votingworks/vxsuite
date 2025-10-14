import './polyfills';
import { AppBase, ErrorBoundary } from '@votingworks/ui';
import { BrowserRouter } from 'react-router-dom';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { BaseLogger, LogEventId, LogSource } from '@votingworks/logging';
import { MachineLockedScreen } from './machine_locked_screen';
import { ErrorScreen } from './error_screen';

function AppRoot({ logger }: { logger: BaseLogger }): JSX.Element | null {
  logger.log(LogEventId.ApplicationStartup, 'system', {
    message: 'VxPrint starting app',
  });

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
      <ErrorBoundary errorMessage={<ErrorScreen />} logger={logger}>
        <BrowserRouter>
          <AppRoot logger={logger} />
        </BrowserRouter>
      </ErrorBoundary>
      <DevDock />
    </AppBase>
  );
}
