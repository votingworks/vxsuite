import './polyfills';
import {
  AppBase,
  ErrorBoundary,
  InvalidCardScreen,
  RemoveCardScreen,
  SetupCardReaderPage,
  UnlockMachineScreen,
} from '@votingworks/ui';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { assert } from '@votingworks/basics';
import { isElectionManagerAuth, isPollWorkerAuth } from '@votingworks/utils';
import {
  ApiClient,
  ApiClientContext,
  checkPin,
  createApiClient,
  createQueryClient,
  getAuthStatus,
  getElection,
} from './api';
import { ErrorScreen } from './error_screen';
import { PollWorkerScreen } from './poll_worker_screen';
import { UnconfiguredScreen } from './unconfigured_screen';
import { MachineLockedScreen } from './machine_locked_screen';
import { ElectionManagerScreen } from './election_manager_screen';

function AppRoot(): JSX.Element | null {
  const getAuthStatusQuery = getAuthStatus.useQuery();
  const checkPinMutation = checkPin.useMutation();
  const getElectionQuery = getElection.useQuery();
  if (!(getAuthStatusQuery.isSuccess && getElectionQuery.isSuccess)) {
    return null;
  }

  const auth = getAuthStatusQuery.data;
  const election = getElectionQuery.data;

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

  if (election.isErr()) {
    return <UnconfiguredScreen />;
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
      <DevDock />
    </AppBase>
  );
}
