import { fakeLogger, Logger } from '@votingworks/logging';
import { MemoryHardware } from '@votingworks/utils';
import { render, RenderResult } from '../react_testing_library';
import { App } from '../../src/app';

export function buildStandardScanHardware(): MemoryHardware {
  return MemoryHardware.build({
    connectPrinter: true,
    connectCardReader: true,
    connectPrecinctScanner: true,
  });
}

export function buildApp(): {
  hardware: MemoryHardware;
  logger: Logger;
  renderApp: () => RenderResult;
} {
  const hardware = buildStandardScanHardware();
  const logger = fakeLogger();
  function renderApp() {
    return render(App({ hardware, logger }));
  }
  return { renderApp, hardware, logger };
}
