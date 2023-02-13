import React from 'react';
import { getHardware } from '@votingworks/utils';
import { BrowserRouter } from 'react-router-dom';
import { Logger, LogSource } from '@votingworks/logging';
import { ColorMode } from '@votingworks/types';
import {
  AppBase,
  ErrorBoundary,
  Prose,
  Text,
} from '@votingworks/shared-frontend';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoot, AppRootProps } from './app_root';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
} from './api';

export interface Props {
  hardware?: AppRootProps['hardware'];
  logger?: AppRootProps['logger'];
  apiClient?: ApiClient;
  queryClient?: QueryClient;
}

export function App({
  hardware = getHardware(),
  logger = new Logger(LogSource.VxCentralScanFrontend, window.kiosk),
  apiClient = createApiClient(),
  queryClient = createQueryClient(),
}: Props): JSX.Element {
  // Copied from old App.css
  const baseFontSizePx = 24;

  // TODO: Default to medium contrast and vary based on user selection.
  const colorMode: ColorMode = 'legacy';

  return (
    <BrowserRouter>
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
            <AppBase
              colorMode={colorMode}
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
