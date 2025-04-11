import { SystemCallContextProvider, TestErrorBoundary } from '@votingworks/ui';
import { createMemoryHistory, MemoryHistory } from 'history';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'react-router-dom';
import { render as testRender, RenderResult } from './react_testing_library';
import { ApiMock } from './mock_api_client';
import {
  ApiClient,
  ApiClientContext,
  createQueryClient,
  systemCallApi,
} from '../src/api';

export interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  apiMock?: ApiMock;
  queryClient?: QueryClient;
}

export function renderRootElement(
  component: React.ReactNode,
  {
    // If there's no apiClient given, we don't want to create one by default,
    // since the apiClient needs to have assertComplete called by the test. If
    // the test doesn't need to make API calls, then it should not pass in an
    // apiClient here, which will cause an error if the test tries to make an
    // API call.
    apiClient,
    queryClient = createQueryClient(),
  }: {
    apiClient?: ApiClient;
    queryClient?: QueryClient;
  } = {}
): RenderResult {
  return testRender(
    <TestErrorBoundary>
      <ApiClientContext.Provider value={apiClient}>
        <QueryClientProvider client={queryClient}>
          <SystemCallContextProvider api={systemCallApi}>
            {component}
          </SystemCallContextProvider>
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </TestErrorBoundary>
  );
}

export function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    apiMock,
    queryClient,
  }: RenderInAppContextParams = {}
): RenderResult {
  return renderRootElement(<Router history={history}>{component}</Router>, {
    apiClient: apiMock?.mockApiClient,
    queryClient,
  });
}
