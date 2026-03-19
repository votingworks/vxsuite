import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ClientAppRoot } from './client_app_root.js';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
} from './api.js';
import { SharedApiClientContext } from '../shared_api.js';

export interface ClientAppProps {
  apiClient?: ApiClient;
  queryClient?: QueryClient;
}

export function ClientApp({
  apiClient,
  queryClient = createQueryClient(),
}: ClientAppProps): JSX.Element {
  const resolvedApiClient = apiClient ?? createApiClient();
  return (
    <ApiClientContext.Provider value={resolvedApiClient}>
      <SharedApiClientContext.Provider value={resolvedApiClient}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <ClientAppRoot />
          </BrowserRouter>
        </QueryClientProvider>
      </SharedApiClientContext.Provider>
    </ApiClientContext.Provider>
  );
}
