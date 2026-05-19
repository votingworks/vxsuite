import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import type { ClientApi, MachineConfig } from '@votingworks/admin-backend';
import {
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth,
  DEV_MACHINE_ID,
  ElectionDefinition,
  Id,
  SystemSettings,
} from '@votingworks/types';
import { mockUsbDriveStatus } from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import type { BatteryInfo } from '@votingworks/backend';
import type { DiskSpaceSummary } from '@votingworks/utils';
import { Mock, vi } from 'vitest';

type MockClientApiClient = Omit<
  MockClient<ClientApi>,
  'getBatteryInfo' | 'getDiskSpaceSummary' | 'isMultiStationAdjudicationEnabled'
> & {
  getBatteryInfo: Mock;
  getDiskSpaceSummary: Mock;
  isMultiStationAdjudicationEnabled: Mock;
};

function createMockClientApiClient(): MockClientApiClient {
  const mockApiClient = createMockClient<ClientApi>();
  (mockApiClient.getBatteryInfo as unknown as Mock) = vi.fn(() =>
    Promise.resolve({ level: 1, discharging: false })
  );
  (mockApiClient.getDiskSpaceSummary as unknown as Mock) = vi.fn(() =>
    Promise.resolve({ total: 3, used: 2, available: 1 })
  );
  (mockApiClient.isMultiStationAdjudicationEnabled as unknown as Mock) = vi.fn(
    () => Promise.resolve(false)
  );
  return mockApiClient as unknown as MockClientApiClient;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createClientApiMock(
  apiClient: MockClientApiClient = createMockClientApiClient()
) {
  return {
    apiClient,

    assertComplete: apiClient.assertComplete,

    setAuthStatus(authStatus: DippedSmartCardAuth.AuthStatus) {
      apiClient.getAuthStatus.expectRepeatedCallsWith().resolves(authStatus);
    },

    expectGetMachineConfig(
      machineConfig: MachineConfig = {
        machineId: DEV_MACHINE_ID,
        codeVersion: 'dev',
      }
    ) {
      apiClient.getMachineConfig.expectCallWith().resolves(machineConfig);
    },

    expectGetCurrentElectionMetadata(
      metadata?: {
        electionDefinition: ElectionDefinition;
        isOfficialResults?: boolean;
        id?: Id;
        createdAt?: string;
        electionPackageHash?: string;
      } | null
    ) {
      apiClient.getCurrentElectionMetadata.expectRepeatedCallsWith().resolves(
        metadata
          ? {
              id: 'election-id',
              createdAt: new Date().toISOString(),
              isOfficialResults: false,
              electionPackageHash: 'test-election-package-hash',
              ...metadata,
            }
          : null
      );
    },

    expectGetUsbDriveStatus(status: UsbDriveStatus['status']): void {
      apiClient.getUsbDriveStatus
        .expectRepeatedCallsWith()
        .resolves(mockUsbDriveStatus(status));
    },

    expectGetUsbPortStatus(): void {
      apiClient.getUsbPortStatus.expectCallWith().resolves({ enabled: true });
    },

    expectGetNetworkConnectionStatus(
      status:
        | 'offline'
        | 'online-waiting-for-host'
        | 'online-connected-to-host'
        | 'online-multiple-hosts-detected',
      hostMachineId?: string
    ): void {
      const value =
        status === 'online-connected-to-host'
          ? { status, hostMachineId: hostMachineId ?? '0001' }
          : { status };
      apiClient.getNetworkConnectionStatus
        .expectRepeatedCallsWith()
        .resolves(value);
    },

    expectGetAdjudicationSessionStatus(
      isClientAdjudicationEnabled = false
    ): void {
      apiClient.getAdjudicationSessionStatus
        .expectRepeatedCallsWith()
        .resolves({ isClientAdjudicationEnabled });
    },

    expectGetSystemSettings(
      systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
    ): void {
      apiClient.getSystemSettings
        .expectRepeatedCallsWith()
        .resolves(systemSettings);
    },

    setBatteryInfo(batteryInfo?: Partial<BatteryInfo>) {
      apiClient.getBatteryInfo.mockResolvedValue({
        level: 0.5,
        discharging: false,
        ...(batteryInfo || {}),
      });
    },

    setDiskSpaceSummary(summary?: DiskSpaceSummary) {
      apiClient.getDiskSpaceSummary.mockResolvedValue(
        summary ?? { total: 3, used: 2, available: 1 }
      );
    },
  };
}

export type ClientApiMock = ReturnType<typeof createClientApiMock>;
