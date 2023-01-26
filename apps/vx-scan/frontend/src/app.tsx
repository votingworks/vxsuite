import React from 'react';
import { BrowserRouter } from 'react-router-dom';

import './App.css';

import { WebServiceCard, getHardware } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import * as grout from '@votingworks/grout';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { Api } from '@votingworks/vx-scan-backend';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary, Text } from '@votingworks/ui';
import { AppRoot, Props as AppRootProps } from './app_root';
import { ApiClientContext, queryClientDefaultOptions } from './api';
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
  queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions }),
}: AppProps): JSX.Element {
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
            <AppRoot card={card} hardware={hardware} logger={logger} />
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
