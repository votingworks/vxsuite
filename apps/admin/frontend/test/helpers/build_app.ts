import { App } from '../../src/app.js';
import { createQueryClient } from '../../src/api.js';
import { renderRootElement } from '../render_in_app_context.js';
import { ApiMock } from './mock_api_client.js';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApp(apiMock: ApiMock) {
  const queryClient = createQueryClient();
  function renderApp() {
    return renderRootElement(
      App({ apiClient: apiMock.apiClient, queryClient }),
      {
        apiClient: apiMock.apiClient,
        queryClient,
      }
    );
  }
  return { apiMock, renderApp };
}
