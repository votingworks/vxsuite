import './polyfills';
import {
  AppBase,
  ErrorBoundary,
  InvalidCardScreen,
  RemoveCardScreen,
  SetupCardReaderPage,
  SystemCallContextProvider,
  UnlockMachineScreen,
  VendorScreen,
} from '@votingworks/ui';
import { BrowserRouter, useHistory } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { assert } from '@votingworks/basics';
import {
  isElectionManagerAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
  isVendorAuth,
} from '@votingworks/utils';
import { BaseLogger, LogEventId, LogSource } from '@votingworks/logging';
import { useEffect, useMemo } from 'react';
import {
  ApiClient,
  ApiClientContext,
  checkPin,
  createApiClient,
  createQueryClient,
  getAuthStatus,
  getElection,
  logOut,
  systemCallApi,
  unconfigure,
  useApiClient,
} from './api';
import { ErrorScreen } from './error_screen';
import { PollWorkerScreen } from './poll_worker_screen';
import { MachineLockedScreen } from './machine_locked_screen';
import { ElectionManagerScreen } from './election_manager_screen';
import { SystemAdministratorScreen } from './system_administrator_screen';
import { UnconfiguredElectionManagerScreen } from './unconfigured_screen';
import { SessionTimeLimitTracker } from './session_time_limit_tracker';

function AppRoot({ logger }: { logger: BaseLogger }): JSX.Element | null {
  const apiClient = useApiClient();
  const checkPinMutation = checkPin.useMutation();
  const logOutMutation = logOut.useMutation();
  const unconfigureMutation = unconfigure.useMutation();
  const getAuthStatusQuery = getAuthStatus.useQuery();
  const getElectionQuery = getElection.useQuery({ refetchInterval: 100 });
  const history = useHistory();

  const loggableUserName = useMemo(
    () =>
      getAuthStatusQuery.data && getAuthStatusQuery.data.status === 'logged_in'
        ? getAuthStatusQuery.data.user.role
        : 'unknown',
    [getAuthStatusQuery.data]
  );

  useEffect(() => {
    logger.log(LogEventId.NavigationPageChange, loggableUserName, {
      message: `Navigated to ${history.location.pathname}`,
    });
    const unlisten = history.listen((location) => {
      logger.log(LogEventId.NavigationPageChange, loggableUserName, {
        message: `Navigated to ${location.pathname}`,
      });
    });
    return () => {
      unlisten();
    };
  }, [logger, history, loggableUserName]);

  if (!getAuthStatusQuery.isSuccess || !getElectionQuery.isSuccess) {
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
        productName="VxPollBook"
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
            ? 'Use a system administrator or election manager card.'
            : 'Use a valid card.'
        }
        cardInsertionDirection="right"
      />
    );
  }

  if (isVendorAuth(auth)) {
    return (
      <VendorScreen
        logOut={logOutMutation.mutate}
        rebootToVendorMenu={apiClient.rebootToVendorMenu}
        unconfigureMachine={() => unconfigureMutation.mutateAsync()}
        isMachineConfigured={getElectionQuery.data.isOk()}
      />
    );
  }

  if (isSystemAdministratorAuth(auth)) {
    return <SystemAdministratorScreen />;
  }

  if (isElectionManagerAuth(auth)) {
    if (getElectionQuery.data.isErr()) {
      return <UnconfiguredElectionManagerScreen />;
    }
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
  const logger = new BaseLogger(LogSource.VxPollBookFrontend, window.kiosk);

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
                <AppRoot logger={logger} />
                <SessionTimeLimitTracker />
              </BrowserRouter>
            </SystemCallContextProvider>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </ErrorBoundary>
      <DevDock />
    </AppBase>
  );
}
