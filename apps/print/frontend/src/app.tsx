import './polyfills';
import {
  AppBase,
  AppErrorBoundary,
  H1,
  P,
  RemoveCardScreen,
  SetupCardReaderPage,
  UnlockMachineScreen,
} from '@votingworks/ui';
import { BrowserRouter } from 'react-router-dom';
import { DevDock } from '@votingworks/dev-dock-frontend';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { isElectionManagerAuth } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { MachineLockedScreen } from './machine_locked_screen';
import {
  ApiClient,
  ApiClientContext,
  checkPin,
  createApiClient,
  createQueryClient,
  getAuthStatus,
  getElectionDefinition,
  getUsbDriveStatus,
} from './api';
import { ElectionManagerScreen } from './election_manager_screen';
import { UnconfiguredElectionScreenWrapper } from './unconfigured_election_screen_wrapper';

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
  const getElectionDefinitionQuery = getElectionDefinition.useQuery();
  const getUsbDriveStatusQuery = getUsbDriveStatus.useQuery();

  if (
    !getAuthStatusQuery.isSuccess ||
    !getElectionDefinitionQuery.isSuccess ||
    !getUsbDriveStatusQuery.isSuccess
  ) {
    return null;
  }

  const authStatus = getAuthStatusQuery.data;
  const electionDefinition = getElectionDefinitionQuery.data;
  const usbDriveStatus = getUsbDriveStatusQuery.data;

  assert(usbDriveStatus);

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
    return <SetupCardReaderPage />;
  }
  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'machine_locked'
  ) {
    return <MachineLockedScreen />;
  }

  if (authStatus.status === 'remove_card') {
    return <RemoveCardScreen productName="VxPrint" />;
  }

  if (
    authStatus.status === 'checking_pin' &&
    ['vendor', 'system_administrator'].includes(authStatus.user.role)
  ) {
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

  if (authStatus.status === 'logged_in') {
    if (!electionDefinition) {
      return <UnconfiguredElectionScreenWrapper />;
    }

    if (isElectionManagerAuth(authStatus)) {
      return <ElectionManagerScreen electionDefinition={electionDefinition} />;
      // Uncomment to access ballot printing screen
      // return <BallotListScreen />;
    }
  }

  // if (!electionRecord) {
  //   return <UnconfiguredElectionScreen usbDriveStatus={usbDriveStatus} />;
  // }

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
            <BrowserRouter>
              <AppRoot logger={logger} apiClient={apiClient} />
            </BrowserRouter>
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </AppErrorBoundary>
      <DevDock />
    </AppBase>
  );
}
