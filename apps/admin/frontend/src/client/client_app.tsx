import { BrowserRouter } from 'react-router-dom';
import { ClientAppRoot } from './client_app_root';
import { ApiClient, ApiClientContext, createApiClient } from './api';

export interface ClientAppProps {
  apiClient?: ApiClient;
}

export function ClientApp({ apiClient }: ClientAppProps): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiClient ?? createApiClient()}>
      <BrowserRouter>
        <ClientAppRoot />
      </BrowserRouter>
    </ApiClientContext.Provider>
  );
}
