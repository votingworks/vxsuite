import { App } from '../../src/app';
import { renderRootElement } from '../render_in_app_context';
import { ApiMock } from './mock_api_client';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApp(apiMock: ApiMock) {
  function renderApp() {
    return renderRootElement(App(), {
      apiClient: apiMock.apiClient,
    });
  }
  return { apiMock, renderApp };
}
