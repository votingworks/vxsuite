import { App } from '../../src/app';
import { createQueryClient } from '../../src/api';
import { renderRootElement } from '../render_in_app_context';
import { ApiMock } from './mock_api_client';

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
