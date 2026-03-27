import React from 'react';
import { BrowserRouter } from 'react-router-dom';

import { DippedSmartCardAuth, DEV_MACHINE_ID } from '@votingworks/types';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MachineConfig } from '@votingworks/admin-backend';
import {
  mockUsbDriveStatus,
  SystemCallContextProvider,
  TestErrorBoundary,
} from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { render as testRender, RenderResult } from './react_testing_library';
import { AppContext, AppContextInterface } from '../src/contexts/app_context';
import {
  ApiClient as ClientApiClient,
  ApiClientContext as ClientApiClientContext,
  createQueryClient,
} from '../src/client/api';
import { SharedApiClientContext, systemCallApi } from '../src/shared_api';
import { ClientApiMock } from './helpers/mock_client_api_client';

export interface RenderInClientContextParams {
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
                <BrowserRouter>{component}</BrowserRouter>
              </AppContext.Provider>
            </QueryClientProvider>
          </ClientApiClientContext.Provider>
        </SystemCallContextProvider>
      </SharedApiClientContext.Provider>
    </TestErrorBoundary>
  );
}
