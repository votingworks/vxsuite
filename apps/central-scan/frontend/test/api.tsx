import React from 'react';
import type { Api } from '@votingworks/central-scan-backend';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { SystemCallContextProvider, TestErrorBoundary } from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { ApiClientContext, createQueryClient, systemCallApi } from '../src/api';

export type MockApiClient = MockClient<Api>;

export function createMockApiClient(): MockApiClient {
  return createMockClient<Api>();
}

export function setAuthStatus(
  mockApiClient: MockApiClient,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  mockApiClient.getAuthStatus.expectRepeatedCallsWith().resolves(authStatus);
}

export function setUsbDriveStatus(
  mockApiClient: MockApiClient,
  usbDriveStatus: UsbDriveStatus
): void {
  mockApiClient.getUsbDriveStatus
    .expectRepeatedCallsWith()
    .resolves(usbDriveStatus);
}

export function provideApi(
  apiMock: ReturnType<typeof createMockApiClient>,
  children: React.ReactNode
): JSX.Element {
  return (
    <TestErrorBoundary>
      <ApiClientContext.Provider value={apiMock}>
        <QueryClientProvider client={createQueryClient()}>
          <SystemCallContextProvider api={systemCallApi}>
            {children}
          </SystemCallContextProvider>
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </TestErrorBoundary>
  );
}
