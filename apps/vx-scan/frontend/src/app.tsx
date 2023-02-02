import React from 'react';
import { BrowserRouter } from 'react-router-dom';

import { WebServiceCard, getHardware } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import * as grout from '@votingworks/grout';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { Api } from '@votingworks/vx-scan-backend';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AppBase,
  ErrorBoundary,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  Text,
} from '@votingworks/ui';
import { ColorMode } from '@votingworks/types';
import { AppRoot, Props as AppRootProps } from './app_root';
import { ApiClientContext } from './api';
import { TimesCircle } from './components/graphics';
import { CenteredLargeProse } from './components/layout';

export interface AppProps {
  hardware?: AppRootProps['hardware'];
  card?: AppRootProps['card'];
  logger?: AppRootProps['logger'];
  apiClient?: grout.Client<Api>;
  queryClient?: QueryClient;
}

export function App({
  hardware = getHardware(),
  card = new WebServiceCard(),
  logger = new Logger(LogSource.VxScanFrontend, window.kiosk),
  apiClient = grout.createClient<Api>({ baseUrl: '/api' }),
  queryClient = new QueryClient({
    defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
  }),
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
              <AppRoot card={card} hardware={hardware} logger={logger} />
            </AppBase>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
