import { fakeLogger } from '@votingworks/logging';
import { fakePrinter } from '@votingworks/test-utils';
import { ConverterClientType } from '@votingworks/types';
import { MemoryHardware } from '@votingworks/utils';
import { App } from '../../src/app';
import { ElectionManagerStoreMemoryBackend } from '../../src/lib/backends';
import { renderRootElement } from '../render_in_app_context';
import { createApiMock, MockApiClient } from './api_mock';

function mockRandomBallotId() {
  return 'Asdf1234Asdf12';
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApp(
  mockApiClient?: MockApiClient,
  converter?: ConverterClientType
) {
  const apiMock = createApiMock(mockApiClient);
  const backend = new ElectionManagerStoreMemoryBackend();
  const hardware = MemoryHardware.build({
    connectCardReader: true,
    connectPrinter: true,
  });
  const logger = fakeLogger();
  const printer = fakePrinter();
  function renderApp() {
    return renderRootElement(
      App({
        hardware,
        printer,
        converter,
        generateBallotId: mockRandomBallotId,
      }),
      {
        apiClient: apiMock.apiClient,
        backend,
        logger,
      }
    );
  }
  return { apiMock, backend, hardware, logger, printer, renderApp };
}
