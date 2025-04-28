import './polyfills';
import {
  AppBase,
  ErrorBoundary,
  InvalidCardScreen,
  RemoveCardScreen,
  SetupCardReaderPage,
  SystemCallContextProvider,
  UnlockMachineScreen,
} from '@votingworks/ui';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { assert } from '@votingworks/basics';
import {
  isElectionManagerAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  ApiClient,
  ApiClientContext,
  checkPin,
  createApiClient,
  createQueryClient,
  getAuthStatus,
  getElection,
  systemCallApi,
} from './api';
import { ErrorScreen } from './error_screen';
import { PollWorkerScreen } from './poll_worker_screen';
import { UnconfiguredElectionManagerScreen } from './unconfigured_screen';
import { MachineLockedScreen } from './machine_locked_screen';
import { ElectionManagerScreen } from './election_manager_screen';
import { SystemAdministratorScreen } from './system_administrator_screen';

function AppRoot(): JSX.Element | null {
  const getAuthStatusQuery = getAuthStatus.useQuery();
  const checkPinMutation = checkPin.useMutation();
  const getElectionQuery = getElection.useQuery();
  if (!getAuthStatusQuery.isSuccess) {
    return null;
  }

  const auth = getAuthStatusQuery.data;

  if (auth.status === 'logged_out' && auth.reason === 'no_card_reader') {
    return <SetupCardReaderPage usePollWorkerLanguage={false} />;
  }

  if (auth.status === 'checking_pin') {
    return (
      <UnlockMachineScreen
        auth={auth}
        checkPin={async (pin) => {
          try {
            await checkPinMutation.mutateAsync({ pin });
          } catch {
            // Handled by default query client error handling
          }
        }}
      />
    );
  }

  if (auth.status === 'remove_card') {
    return (
      <RemoveCardScreen
        productName="VxPollbook"
        cardInsertionDirection="right"
      />
    );
  }

  if (auth.status === 'logged_out') {
    if (
      auth.reason === 'machine_locked' ||
      auth.reason === 'machine_locked_by_session_expiry'
    ) {
      return <MachineLockedScreen />;
    }
    return (
      <InvalidCardScreen
        reasonAndContext={auth}
        recommendedAction={
          auth.reason === 'machine_not_configured'
            ? 'Use an election manager card.'
            : 'Use a valid election manager or poll worker card.'
        }
        cardInsertionDirection="right"
      />
    );
  }

  if (isSystemAdministratorAuth(auth)) {
    return <SystemAdministratorScreen />;
  }

  if (!getElectionQuery.isSuccess || getElectionQuery.data.isErr()) {
    return <UnconfiguredElectionManagerScreen />;
  }

  if (isElectionManagerAuth(auth)) {
    return <ElectionManagerScreen />;
  }

  assert(isPollWorkerAuth(auth));
  return <PollWorkerScreen />;
}

export function App({
  apiClient = createApiClient(),
}: {
  apiClient?: ApiClient;
}): JSX.Element {
  const logger = new BaseLogger(LogSource.System);
  return (
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      screenType="lenovoThinkpad15"
      showScrollBars
    >
      <ErrorBoundary errorMessage={<ErrorScreen />} logger={logger}>
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={createQueryClient()}>
            <SystemCallContextProvider api={systemCallApi}>
              <BrowserRouter>
                <AppRoot />
              </BrowserRouter>
            </SystemCallContextProvider>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </ErrorBoundary>
      <DevDock />
    </AppBase>
  );
}
