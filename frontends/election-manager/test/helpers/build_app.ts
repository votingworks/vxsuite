import { RenderResult } from '@testing-library/react';
import { fakeLogger, Logger } from '@votingworks/logging';
import { fakePrinter } from '@votingworks/test-utils';
import { ElectionDefinition, Printer } from '@votingworks/types';
import { MemoryHardware } from '@votingworks/utils';
import { App } from '../../src/app';
import { ElectionManagerStoreMemoryBackend } from '../../src/lib/backends';
import { renderRootElement } from '../render_in_app_context';
import { createMockApiClient, MockApiClient } from './api';

export function buildApp(electionDefinition: ElectionDefinition): {
  apiClient: MockApiClient;
  backend: ElectionManagerStoreMemoryBackend;
  hardware: MemoryHardware;
  logger: Logger;
  printer: Printer;
  renderApp: () => RenderResult;
} {
  const apiClient = createMockApiClient();
  const backend = new ElectionManagerStoreMemoryBackend({ electionDefinition });
  const hardware = MemoryHardware.build({
    connectCardReader: true,
    connectPrinter: true,
  });
  const logger = fakeLogger();
  const printer = fakePrinter();
  function renderApp() {
    return renderRootElement(App({ hardware, printer }), {
      apiClient,
      backend,
      logger,
    });
  }
  return { apiClient, backend, hardware, logger, printer, renderApp };
}
