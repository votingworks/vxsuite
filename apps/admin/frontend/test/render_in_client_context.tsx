import { createMemoryHistory, type MemoryHistory } from 'history';
import type React from 'react';
import { Router } from 'react-router-dom';

import { type DippedSmartCardAuth, DEV_MACHINE_ID } from '@votingworks/types';

import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MachineConfig } from '@votingworks/admin-backend';
import {
  mockUsbDriveStatus,
  SystemCallContextProvider,
  TestErrorBoundary,
} from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import {
  render as testRender,
  type RenderResult,
} from './react_testing_library.js';
import {
  AppContext,
  type AppContextInterface,
} from '../src/contexts/app_context.js';
import {
  type ApiClient as ClientApiClient,
  ApiClientContext as ClientApiClientContext,
  createQueryClient,
} from '../src/client/api.js';
import { SharedApiClientContext, systemCallApi } from '../src/shared_api.js';
import type { ClientApiMock } from './helpers/mock_client_api_client.js';

export interface RenderInClientContextParams {
  route?: string;
  history?: MemoryHistory;
  auth: DippedSmartCardAuth.AuthStatus;
  electionDefinition?: AppContextInterface['electionDefinition'];
  electionPackageHash?: string;
  isOfficialResults?: boolean;
  usbDriveStatus?: UsbDriveStatus;
  machineConfig?: MachineConfig;
  apiMock: ClientApiMock;
  queryClient?: QueryClient;
}

export function renderInClientContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    auth,
    electionDefinition,
    electionPackageHash = electionDefinition
      ? 'test-election-package-hash'
      : undefined,
    isOfficialResults = false,
    usbDriveStatus = mockUsbDriveStatus('no_drive'),
    machineConfig = {
      machineId: DEV_MACHINE_ID,
      codeVersion: 'dev',
    },
    apiMock,
    queryClient = createQueryClient(),
  }: RenderInClientContextParams
): RenderResult {
  const clientApiClient = apiMock.apiClient as unknown as ClientApiClient;
  return testRender(
    <TestErrorBoundary>
      <SharedApiClientContext.Provider value={clientApiClient}>
        <SystemCallContextProvider api={systemCallApi}>
          <ClientApiClientContext.Provider value={clientApiClient}>
            <QueryClientProvider client={queryClient}>
              <AppContext.Provider
                value={{
                  auth,
                  machineConfig,
                  isOfficialResults,
                  usbDriveStatus,
                  machineMode: 'client',
                  electionDefinition,
                  electionPackageHash,
                }}
              >
                <Router history={history}>{component}</Router>
              </AppContext.Provider>
            </QueryClientProvider>
          </ClientApiClientContext.Provider>
        </SystemCallContextProvider>
      </SharedApiClientContext.Provider>
    </TestErrorBoundary>
  );
}
