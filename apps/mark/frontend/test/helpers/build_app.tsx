import { vi } from 'vitest';
import { mockBaseLogger, type BaseLogger } from '@votingworks/logging';
import { render, type RenderResult } from '../react_testing_library.js';
import { App } from '../../src/app.js';
import type { createApiMock } from './mock_api_client.js';

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
