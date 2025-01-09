import './polyfills';
import { AppBase, ErrorBoundary } from '@votingworks/ui';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  ApiClient,
  ApiClientContext,
  createApiClient,
  createQueryClient,
  getElectionConfiguration,
} from './api';
import { ErrorScreen } from './error_screen';
import { PollWorkerScreen } from './poll_worker_screen';
import { UnconfiguredScreen } from './unconfigured_screen';

function AppRoot(): JSX.Element | null {
  const getElectionConfigurationQuery = getElectionConfiguration.useQuery();
  if (!getElectionConfigurationQuery.isSuccess) {
    return null;
  }

  const electionConfiguration = getElectionConfigurationQuery.data;

  if (electionConfiguration.isErr()) {
    return <UnconfiguredScreen />;
  }

  return <PollWorkerScreen />;
}

export function App({
  apiClient = createApiClient(),
}: {
  apiClient?: ApiClient;
}): JSX.Element {
  return (
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      screenType="lenovoThinkpad15"
      showScrollBars
    >
      <ErrorBoundary errorMessage={<ErrorScreen />}>
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={createQueryClient()}>
            <BrowserRouter>
              <AppRoot />
            </BrowserRouter>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </ErrorBoundary>
    </AppBase>
  );
}
