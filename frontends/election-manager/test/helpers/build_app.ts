import { RenderResult } from '@testing-library/react';
import { fakeLogger, Logger } from '@votingworks/logging';
import { fakePrinter } from '@votingworks/test-utils';
import { ElectionDefinition, Printer } from '@votingworks/types';
import { MemoryCard, MemoryHardware } from '@votingworks/utils';
import { App } from '../../src/app';
import { ElectionManagerStoreMemoryBackend } from '../../src/lib/backends';
import { renderRootElement } from '../render_in_app_context';

export function buildApp(electionDefinition: ElectionDefinition): {
  card: MemoryCard;
  hardware: MemoryHardware;
  logger: Logger;
  printer: Printer;
  backend: ElectionManagerStoreMemoryBackend;
  renderApp: () => RenderResult;
} {
  const card = new MemoryCard();
  const hardware = MemoryHardware.build({
    connectCardReader: true,
    connectPrinter: true,
  });
  const logger = fakeLogger();
  const printer = fakePrinter();
  const backend = new ElectionManagerStoreMemoryBackend({ electionDefinition });
  function renderApp() {
    return renderRootElement(App({ card, hardware, printer }), {
      logger,
      backend,
    });
  }
  return { renderApp, card, hardware, logger, printer, backend };
}
