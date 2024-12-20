import './polyfills';
import { AppBase, ErrorBoundary } from '@votingworks/ui';
import { BrowserRouter, Redirect, Route, Switch } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
} from './api';
import { ErrorScreen } from './error_screen';
import { NavScreen } from './nav_screen';

export function App({
  apiClient = createApiClient(),
}: {
  apiClient?: ApiClient;
}): JSX.Element {
  return (
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      showScrollBars
    >
      <ErrorBoundary errorMessage={<ErrorScreen />}>
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={createQueryClient()}>
            <BrowserRouter>
              <NavScreen>
                <div style={{ padding: '1rem' }}>Hello</div>
              </NavScreen>
            </BrowserRouter>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </ErrorBoundary>
    </AppBase>
  );
}
