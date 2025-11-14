import './polyfills';
import {
  AppBase,
  AppErrorBoundary,
  H1,
  InvalidCardScreen,
  P,
  RemoveCardScreen,
  SetupCardReaderPage,
  SystemCallContextProvider,
  UnlockMachineScreen,
} from '@votingworks/ui';
import { BrowserRouter } from 'react-router-dom';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  isElectionManagerAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { MachineLockedScreen } from './screens/machine_locked_screen';
import {
  ApiClient,
  ApiClientContext,
  checkPin,
  createApiClient,
  createQueryClient,
  getAuthStatus,
  getElectionRecord,
  getUsbDriveStatus,
  systemCallApi,
} from './api';
import { ElectionManagerApp } from './election_manager_app';
import { UnconfiguredElectionManagerScreen } from './screens/unconfigured_election_manager_screen';
import { SystemAdministratorApp } from './system_administrator_app';
import { PollWorkerApp } from './poll_worker_app';

function AppRoot({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logger,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  apiClient,
}: {
  logger: BaseLogger;
  apiClient: ApiClient;
}): JSX.Element | null {
  const checkPinMutation = checkPin.useMutation();
  const getAuthStatusQuery = getAuthStatus.useQuery();
  const getElectionRecordQuery = getElectionRecord.useQuery();
  const getUsbDriveStatusQuery = getUsbDriveStatus.useQuery();

  if (
    !getAuthStatusQuery.isSuccess ||
    !getElectionRecordQuery.isSuccess ||
    !getUsbDriveStatusQuery.isSuccess
  ) {
    return null;
  }

  const authStatus = getAuthStatusQuery.data;
  const electionRecord = getElectionRecordQuery.data;
  const usbDriveStatus = getUsbDriveStatusQuery.data;

  assert(usbDriveStatus);

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
    return <SetupCardReaderPage />;
  }

  if (authStatus.status === 'checking_pin') {
    return (
      <UnlockMachineScreen
        auth={authStatus}
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

  if (authStatus.status === 'remove_card') {
    return (
      <RemoveCardScreen
        productName="VxPollBook"
        cardInsertionDirection="right"
      />
    );
  }

  if (authStatus.status === 'logged_out') {
    if (
      authStatus.reason === 'machine_locked' ||
      authStatus.reason === 'machine_locked_by_session_expiry'
    ) {
      return <MachineLockedScreen />;
    }

    return (
      <InvalidCardScreen
        reasonAndContext={authStatus}
        recommendedAction={
          authStatus.reason === 'machine_not_configured'
            ? 'Use a system administrator or election manager card.'
            : 'Use a valid card.'
        }
        cardInsertionDirection="right"
      />
    );
  }

  if (authStatus.status === 'logged_in') {
    if (isSystemAdministratorAuth(authStatus)) {
      return <SystemAdministratorApp />;
    }

    if (isElectionManagerAuth(authStatus)) {
      if (!electionRecord) {
        return <UnconfiguredElectionManagerScreen />;
      }
      return <ElectionManagerApp />;
      // Uncomment to access ballot printing screen
      // return <BallotListScreen />;
    }
    assert(isPollWorkerAuth(authStatus));
    return <PollWorkerApp />;
  }

  return (
    <React.Fragment>
      <H1>Unhandled auth/election state</H1>
      <P>{JSON.stringify(authStatus)}</P>
    </React.Fragment>
  );
}

export function App({
  apiClient = createApiClient(),
  queryClient = createQueryClient(),
}: {
  apiClient?: ApiClient;
  queryClient?: QueryClient;
}): JSX.Element {
  const logger = new BaseLogger(LogSource.VxPrintFrontend, window.kiosk);

  return (
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      screenType="lenovoThinkpad15"
      showScrollBars
    >
      <AppErrorBoundary
        restartMessage="Please restart the machine."
        logger={logger}
      >
        <ApiClientContext.Provider value={apiClient}>
          <QueryClientProvider client={queryClient}>
            <SystemCallContextProvider api={systemCallApi}>
              <BrowserRouter>
                <AppRoot logger={logger} apiClient={apiClient} />
              </BrowserRouter>
            </SystemCallContextProvider>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </AppErrorBoundary>
      <DevDock />
    </AppBase>
  );
}
