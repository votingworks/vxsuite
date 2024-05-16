import { createMemoryHistory, MemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';

import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import { ElectionDefinition, DippedSmartCardAuth } from '@votingworks/types';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
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
  electionWithMsEitherNeitherDefinition;

export interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  electionDefinition?: ElectionDefinition | 'NONE';
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
    auth = electionDefinition === 'NONE'
      ? {
          status: 'logged_in',
          user: mockSystemAdministratorUser(),
          sessionExpiresAt: mockSessionExpiresAt(),
          programmableCard: { status: 'no_card' },
        }
      : {
          status: 'logged_in',
          user: mockElectionManagerUser({
            electionHash: electionDefinition.electionHash,
          }),
          sessionExpiresAt: mockSessionExpiresAt(),
        },
    machineConfig = {
      machineId: '0000',
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
          electionDefinition === 'NONE' ? undefined : electionDefinition,
        configuredAt,
        isOfficialResults,
        usbDriveStatus,
        auth,
        machineConfig,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>,
    { apiClient: apiMock?.apiClient, queryClient }
  );
}
