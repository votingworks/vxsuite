import { mockBaseLogger, BaseLogger } from '@votingworks/logging';
import { MemoryHardware } from '@votingworks/utils';
import { render, RenderResult } from '../react_testing_library';
import { App } from '../../src/app';
import { createApiMock } from './mock_api_client';

export function buildApp(apiMock: ReturnType<typeof createApiMock>): {
  logger: BaseLogger;
  hardware: MemoryHardware;
  reload: () => void;
  renderApp: () => RenderResult;
} {
  const logger = mockBaseLogger();
  const hardware = MemoryHardware.build({
    connectPrinter: true,
    connectAccessibleController: true,
  });
  const reload = jest.fn();
  function renderApp() {
    return render(
      <App
        hardware={hardware}
        reload={reload}
        logger={logger}
        apiClient={apiMock.mockApiClient}
      />
    );
  }

  return {
    logger,
    hardware,
    reload,
    renderApp,
  };
}
