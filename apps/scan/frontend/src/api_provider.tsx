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
}: {
  queryClient?: QueryClient;
  apiClient: ApiClient;
  enableStringTranslation?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiClient}>
      <QueryClientProvider client={queryClient}>
        <SystemCallContextProvider api={systemCallApi}>
          <UiStringsContextProvider
            api={uiStringsApi}
            disabled={!enableStringTranslation}
            noAudio
          >
            {children}
          </UiStringsContextProvider>
        </SystemCallContextProvider>
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}
