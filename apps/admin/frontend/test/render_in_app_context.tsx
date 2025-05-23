import { createMemoryHistory, MemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';

import { readElectionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import {
  ElectionDefinition,
  DippedSmartCardAuth,
  constructElectionKey,
  DEV_MACHINE_ID,
} from '@votingworks/types';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import type { MachineConfig } from '@votingworks/admin-backend';
import {
  mockUsbDriveStatus,
  SystemCallContextProvider,
  TestErrorBoundary,
} from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { render as testRender, RenderResult } from './react_testing_library';
import { AppContext } from '../src/contexts/app_context';
import { Iso8601Timestamp } from '../src/config/types';
import {
  ApiClient,
  ApiClientContext,
  createQueryClient,
  systemCallApi,
} from '../src/api';
import { ApiMock } from './helpers/mock_api_client';

export const eitherNeitherElectionDefinition =
  readElectionWithMsEitherNeitherDefinition();

export interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  electionDefinition?: ElectionDefinition | null;
  configuredAt?: Iso8601Timestamp;
  isOfficialResults?: boolean;
  usbDriveStatus?: UsbDriveStatus;
  auth?: DippedSmartCardAuth.AuthStatus;
  machineConfig?: MachineConfig;
  hasPrinterAttached?: boolean;
  apiMock?: ApiMock;
  queryClient?: QueryClient;
}

export function renderRootElement(
  component: React.ReactNode,
  {
    // If there's no apiClient given, we don't want to create one by default,
    // since the apiClient needs to have assertComplete called by the test. If
    // the test doesn't need to make API calls, then it should not pass in an
    // apiClient here, which will cause an error if the test tries to make an
    // API call.
    apiClient,
    queryClient = createQueryClient(),
  }: {
    apiClient?: ApiClient;
    queryClient?: QueryClient;
  } = {}
): RenderResult {
  return testRender(
    <TestErrorBoundary>
      <ApiClientContext.Provider value={apiClient}>
        <QueryClientProvider client={queryClient}>
          <SystemCallContextProvider api={systemCallApi}>
            {component}
          </SystemCallContextProvider>
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </TestErrorBoundary>
  );
}

export function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    electionDefinition = eitherNeitherElectionDefinition,
    configuredAt = new Date().toISOString(),
    isOfficialResults = false,
    usbDriveStatus = mockUsbDriveStatus('no_drive'),
    auth = electionDefinition
      ? {
          status: 'logged_in',
          user: mockElectionManagerUser({
            electionKey: constructElectionKey(electionDefinition.election),
          }),
          sessionExpiresAt: mockSessionExpiresAt(),
        }
      : {
          status: 'logged_out',
          reason: 'machine_locked',
        },
    machineConfig = {
      machineId: DEV_MACHINE_ID,
      codeVersion: 'dev',
    },
    apiMock,
    queryClient,
  }: RenderInAppContextParams = {}
): RenderResult {
  return renderRootElement(
    <AppContext.Provider
      value={{
        electionDefinition:
          electionDefinition === null ? undefined : electionDefinition,
        configuredAt,
        isOfficialResults,
        usbDriveStatus,
        auth,
        machineConfig,
        electionPackageHash: 'test-election-package-hash',
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>,
    { apiClient: apiMock?.apiClient, queryClient }
  );
}
