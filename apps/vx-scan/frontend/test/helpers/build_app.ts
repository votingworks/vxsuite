import { render, RenderResult } from '@testing-library/react';
import { fakeLogger, Logger } from '@votingworks/logging';
import { MemoryCard, MemoryHardware } from '@votingworks/utils';
import { App } from '../../src/app';

export function buildApp(connectPrinter = false): {
  card: MemoryCard;
  hardware: MemoryHardware;
  logger: Logger;
  renderApp: () => RenderResult;
} {
  const card = new MemoryCard();
  const hardware = MemoryHardware.build({
    connectPrinter,
    connectCardReader: true,
    connectPrecinctScanner: true,
  });
  const logger = fakeLogger();
  function renderApp() {
    return render(App({ card, hardware, logger }));
  }
  return { renderApp, card, hardware, logger };
}
