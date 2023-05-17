import './polyfills';
import React from 'react';
import ReactDom from 'react-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { DevDock } from '@votingworks/dev-dock-frontend';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { ErrorBoundary, Prose, Text } from '@votingworks/ui';
import { App } from './app';
import { ApiClientContext, createApiClient, createQueryClient } from './api';

const apiClient = createApiClient();
const queryClient = createQueryClient();

ReactDom.render(
  <React.StrictMode>
    {/* TODO: Move these wrappers down a level into <App> so that we can 1) test the ErrorBoundary
      and 2) be more consistent with other Vx apps. This will require updating test utils to not
      render their own providers when rendering <App> */}
    <ErrorBoundary
      errorMessage={
        <Prose textCenter>
          <h1>Something went wrong</h1>
          <Text>Please restart the machine.</Text>
        </Prose>
      }
    >
      <ApiClientContext.Provider value={apiClient}>
        <QueryClientProvider client={queryClient}>
          <App />
          {isFeatureFlagEnabled(
            BooleanEnvironmentVariableName.ENABLE_REACT_QUERY_DEVTOOLS
          ) && (
            <div className="no-print">
              <ReactQueryDevtools initialIsOpen={false} position="top-left" />
            </div>
          )}
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </ErrorBoundary>
    <DevDock />
  </React.StrictMode>,
  document.getElementById('root')
);
