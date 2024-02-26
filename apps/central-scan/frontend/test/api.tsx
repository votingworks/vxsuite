import React from 'react';
import type { Api, MachineConfig } from '@votingworks/central-scan-backend';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth,
  ElectionDefinition,
  SystemSettings,
} from '@votingworks/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { SystemCallContextProvider, TestErrorBoundary } from '@votingworks/ui';
import type { BatteryInfo, DiskSpaceSummary } from '@votingworks/backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { ok } from '@votingworks/basics';
import { ApiClientContext, createQueryClient, systemCallApi } from '../src/api';

export type MockApiClient = Omit<MockClient<Api>, 'getBatteryInfo'> & {
  // Because this is polled so frequently, we opt for a standard jest mock instead of a
  // libs/test-utils mock since the latter requires every call to be explicitly mocked
  getBatteryInfo: jest.Mock;
};

export function createMockApiClient(): MockApiClient {
  const mockApiClient = createMockClient<Api>();
  // For some reason, using an object spread to override the polling methods breaks the rest
  // of the mockApiClient, so we override like this instead
  (mockApiClient.getBatteryInfo as unknown as jest.Mock) = jest.fn(() =>
    Promise.resolve({ level: 1, discharging: false })
  );
  return mockApiClient as unknown as MockApiClient;
}

/**
 * Creates a VxCentralScan specific wrapper around commonly used methods from the Grout
 * mock API client to make it easier to use for our specific test needs
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createApiMock(
  apiClient: MockApiClient = createMockApiClient()
) {
  return {
    apiClient,

    assertComplete: apiClient.assertComplete,

    setAuthStatus(authStatus: DippedSmartCardAuth.AuthStatus) {
      apiClient.getAuthStatus.expectRepeatedCallsWith().resolves(authStatus);
    },

    expectLogOut() {
      apiClient.logOut.expectCallWith().resolves();
    },

    expectCheckPin(pin: string) {
      apiClient.checkPin.expectCallWith({ pin }).resolves();
    },

    setUsbDriveStatus(usbDriveStatus: UsbDriveStatus) {
      apiClient.getUsbDriveStatus
        .expectRepeatedCallsWith()
        .resolves(usbDriveStatus);
    },

    expectEjectUsbDrive() {
      apiClient.ejectUsbDrive.expectCallWith().resolves();
    },

    setBatteryInfo(batteryInfo: Partial<BatteryInfo>) {
      apiClient.getBatteryInfo.mockResolvedValue({
        level: 1,
        discharging: false,
        ...batteryInfo,
      });
    },

    expectGetMachineConfig(machineConfig: Partial<MachineConfig> = {}) {
      apiClient.getMachineConfig.expectRepeatedCallsWith().resolves({
        codeVersion: 'dev',
        machineId: '0001',
        ...machineConfig,
      });
    },

    expectGetSystemSettings(systemSettings?: SystemSettings) {
      apiClient.getSystemSettings
        .expectRepeatedCallsWith()
        .resolves(systemSettings ?? DEFAULT_SYSTEM_SETTINGS);
    },

    expectGetElectionDefinition(electionDefinition: ElectionDefinition | null) {
      apiClient.getElectionDefinition
        .expectRepeatedCallsWith()
        .resolves(electionDefinition);
    },

    expectGetTestMode(testMode: boolean) {
      apiClient.getTestMode.expectRepeatedCallsWith().resolves(testMode);
    },

    expectConfigure(electionDefinition: ElectionDefinition) {
      apiClient.configureFromElectionPackageOnUsbDrive
        .expectCallWith()
        .resolves(ok(electionDefinition));
    },

    expectExportCastVoteRecords(input: { isMinimalExport: boolean }) {
      apiClient.exportCastVoteRecordsToUsbDrive
        .expectCallWith(input)
        .resolves(ok());
    },

    expectSetTestMode(testMode: boolean) {
      apiClient.setTestMode.expectCallWith({ testMode }).resolves();
    },

    expectUnconfigure(input: { ignoreBackupRequirement: boolean }) {
      apiClient.unconfigure.expectCallWith(input).resolves();
    },

    expectDeleteBatch(input: { batchId: string }) {
      apiClient.deleteBatch.expectCallWith(input).resolves();
    },

    expectClearBallotData() {
      apiClient.clearBallotData.expectCallWith().resolves();
    },

    expectGetApplicationDiskSpaceSummary(summary: DiskSpaceSummary) {
      apiClient.getApplicationDiskSpaceSummary
        .expectCallWith()
        .resolves(summary);
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;

export function provideApi(
  apiMock: ApiMock,
  children: React.ReactNode
): JSX.Element {
  return (
    <TestErrorBoundary>
      <ApiClientContext.Provider value={apiMock.apiClient}>
        <QueryClientProvider client={createQueryClient()}>
          <SystemCallContextProvider api={systemCallApi}>
            {children}
          </SystemCallContextProvider>
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </TestErrorBoundary>
  );
}
