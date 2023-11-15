import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { DevDock } from '@votingworks/dev-dock-frontend';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { AppBase, ErrorBoundary, H1, P } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { App } from './app';
import { ApiClientContext, createApiClient, createQueryClient } from './api';

/* Copied from old App.css */
const PRINT_FONT_SIZE_PX = 14;

const apiClient = createApiClient();
const queryClient = createQueryClient();

const rootElement = document.getElementById('root');
assert(rootElement);
const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      screenType="lenovoThinkpad15"
      legacyPrintFontSizePx={PRINT_FONT_SIZE_PX}
    >
      {/* TODO: Move these wrappers down a level into <App> so that we can 1) test the ErrorBoundary
      and 2) be more consistent with other Vx apps. This will require updating test utils to not
      render their own providers when rendering <App> */}
      <ErrorBoundary
        errorMessage={
          <React.Fragment>
            <H1>Something went wrong</H1>
            <P>Please restart the machine.</P>
          </React.Fragment>
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
    </AppBase>
  </React.StrictMode>
);
