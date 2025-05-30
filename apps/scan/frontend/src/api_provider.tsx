import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  SystemCallContextProvider,
  UiStringsContextProvider,
} from '@votingworks/ui';
import {
  ApiClient,
  ApiClientContext,
  createQueryClient,
  systemCallApi,
  uiStringsApi,
} from './api';

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
            api={uiStringsApi}
            disabled={!enableStringTranslation}
            noAudio={noAudio}
          >
            {children}
          </UiStringsContextProvider>
        </SystemCallContextProvider>
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}
