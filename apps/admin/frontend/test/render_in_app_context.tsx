import { createMemoryHistory, MemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';

import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import {
  ElectionDefinition,
  Printer,
  DippedSmartCardAuth,
  ConverterClientType,
} from '@votingworks/types';
import { NullPrinter, randomBallotId } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
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
  converter?: ConverterClientType;
  isOfficialResults?: boolean;
  printer?: Printer;
  usbDriveStatus?: UsbDriveStatus;
  generateBallotId?: () => string;
  auth?: DippedSmartCardAuth.AuthStatus;
  machineConfig?: MachineConfig;
  hasCardReaderAttached?: boolean;
  hasPrinterAttached?: boolean;
  logger?: Logger;
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
    converter = undefined,
    printer = new NullPrinter(),
    usbDriveStatus = mockUsbDriveStatus('no_drive'),
    generateBallotId = randomBallotId,
    auth = electionDefinition === 'NONE'
      ? {
          status: 'logged_in',
          user: fakeSystemAdministratorUser(),
          sessionExpiresAt: fakeSessionExpiresAt(),
          programmableCard: { status: 'no_card' },
        }
      : {
          status: 'logged_in',
          user: fakeElectionManagerUser({
            electionHash: electionDefinition.electionHash,
          }),
          sessionExpiresAt: fakeSessionExpiresAt(),
        },
    machineConfig = {
      machineId: '0000',
      codeVersion: 'dev',
    },
    hasCardReaderAttached = true,
    logger = new Logger(LogSource.VxAdminFrontend),
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
        converter,
        printer,
        usbDriveStatus,
        generateBallotId,
        auth,
        machineConfig,
        hasCardReaderAttached,
        logger,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>,
    { apiClient: apiMock?.apiClient, queryClient }
  );
}
