import React from 'react';
import { BrowserRouter } from 'react-router-dom';

import { getHardware } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppBase, ErrorBoundary, Text } from '@votingworks/shared-frontend';
import { ColorMode } from '@votingworks/types';
import { AppRoot, Props as AppRootProps } from './app_root';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
} from './api';
import { TimesCircle } from './components/graphics';
import { CenteredLargeProse } from './components/layout';

export interface AppProps {
  hardware?: AppRootProps['hardware'];
  logger?: AppRootProps['logger'];
  apiClient?: ApiClient;
  queryClient?: QueryClient;
}

export function App({
  hardware = getHardware(),
  logger = new Logger(LogSource.VxScanFrontend, window.kiosk),
  apiClient = createApiClient(),
  queryClient = createQueryClient(),
}: AppProps): JSX.Element {
  // Copied from old App.css
  const baseFontSizePx = 28;

  // TODO: Default to high contrast and vary based on user selection.
  const colorMode: ColorMode = 'legacy';

  return (
    <BrowserRouter>
      <ErrorBoundary
        errorMessage={
          <React.Fragment>
            <TimesCircle />
            <CenteredLargeProse>
              <h1>Something went wrong</h1>
              <Text>Ask a poll worker to restart the scanner.</Text>
            </CenteredLargeProse>
          </React.Fragment>
        }
      >
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={queryClient}>
            <AppBase
              colorMode={colorMode}
              isTouchscreen
              legacyBaseFontSizePx={baseFontSizePx}
            >
              <AppRoot hardware={hardware} logger={logger} />
            </AppBase>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
