import { render, RenderResult } from '@testing-library/react';
import { fakeLogger, Logger } from '@votingworks/logging';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';
import { App } from '../../src/app';

export function buildApp(connectPrinter = false): {
  card: MemoryCard;
  hardware: MemoryHardware;
  storage: MemoryStorage;
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
  const storage = new MemoryStorage();
  function renderApp() {
    return render(App({ card, hardware, storage, logger }));
  }
  return { renderApp, card, hardware, logger, storage };
}
