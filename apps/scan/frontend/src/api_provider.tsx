import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  SystemCallContextProvider,
  UiStringsContextProvider as UiStringsContextProviderBase,
} from '@votingworks/ui';
import {
  ApiClient,
  ApiClientContext,
  createQueryClient,
  getConfig,
  systemCallApi,
  uiStringsApi,
} from './api';

function UiStringsContextProvider({
  children,
  enableStringTranslation,
  noAudio,
}: {
  children: React.ReactNode;
  enableStringTranslation?: boolean;
  noAudio?: boolean;
}): JSX.Element | null {
  const configQuery = getConfig.useQuery();

  const systemSettings = configQuery.data?.systemSettings;
  const disableScreenReaderAudio =
    !systemSettings || systemSettings.precinctScanDisableScreenReaderAudio;

  return (
    <UiStringsContextProviderBase
      api={uiStringsApi}
      disabled={!enableStringTranslation}
      noAudio={noAudio || disableScreenReaderAudio}
    >
      {children}
    </UiStringsContextProviderBase>
  );
}

export function ApiProvider({
  queryClient = createQueryClient(),
  apiClient,
  enableStringTranslation,
  children,
  noAudio,
}: {
  queryClient?: QueryClient;
  apiClient: ApiClient;
  enableStringTranslation?: boolean;
  children: React.ReactNode;
  noAudio?: boolean;
}): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiClient}>
      <QueryClientProvider client={queryClient}>
        <SystemCallContextProvider api={systemCallApi}>
          <UiStringsContextProvider
            enableStringTranslation={enableStringTranslation}
            noAudio={noAudio}
          >
            {children}
          </UiStringsContextProvider>
        </SystemCallContextProvider>
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}
