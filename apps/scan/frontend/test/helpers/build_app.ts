import { render, RenderResult } from '@testing-library/react';
import { fakeLogger, Logger } from '@votingworks/logging';
import { MemoryHardware } from '@votingworks/shared';
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
