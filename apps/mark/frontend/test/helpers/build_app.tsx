import { vi } from 'vitest';
import { mockBaseLogger, BaseLogger } from '@votingworks/logging';
import { render, RenderResult } from '../react_testing_library';
import { App } from '../../src/app';
import { createApiMock } from './mock_api_client';

export function buildApp(apiMock: ReturnType<typeof createApiMock>): {
  logger: BaseLogger;
  renderApp: () => RenderResult;
} {
  const logger = mockBaseLogger({ fn: vi.fn });
  function renderApp() {
    return render(<App logger={logger} apiClient={apiMock.mockApiClient} />);
  }

  return {
    logger,
    renderApp,
  };
}
