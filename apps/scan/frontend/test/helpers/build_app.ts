import { fakeLogger, Logger } from '@votingworks/logging';
import { MemoryHardware } from '@votingworks/utils';
import { render, RenderResult } from '../react_testing_library';
import { App } from '../../src/app';

export function buildApp(connectPrinter = false): {
  hardware: MemoryHardware;
  logger: Logger;
  renderApp: () => RenderResult;
} {
  const hardware = MemoryHardware.build({
    connectPrinter,
    connectCardReader: true,
    connectPrecinctScanner: true,
  });
  const logger = fakeLogger();
  function renderApp() {
    return render(App({ hardware, logger }));
  }
  return { renderApp, hardware, logger };
}
