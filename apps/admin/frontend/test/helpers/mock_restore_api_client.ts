import {
  createMockClient,
  type MockClient,
} from '@votingworks/grout-test-utils';
import type { MachineConfig, RestoreApi } from '@votingworks/admin-backend';
import { DEV_MACHINE_ID, type DippedSmartCardAuth } from '@votingworks/types';
import { type Mock, vi } from 'vitest';

type MockRestoreApiClient = Omit<
  MockClient<RestoreApi>,
  'getBatteryInfo' | 'getDiskSpaceSummary'
> & {
  getBatteryInfo: Mock;
  getDiskSpaceSummary: Mock;
};

function createMockRestoreApiClient(): MockRestoreApiClient {
  const mockApiClient = createMockClient<RestoreApi>();
  (mockApiClient.getBatteryInfo as unknown as Mock) = vi.fn(() =>
    Promise.resolve({ level: 1, discharging: false })
  );
  (mockApiClient.getDiskSpaceSummary as unknown as Mock) = vi.fn(() =>
    Promise.resolve({ total: 3, used: 2, available: 1 })
  );
  return mockApiClient as unknown as MockRestoreApiClient;
}

export interface RestoreApiMock {
  apiClient: MockRestoreApiClient;
  assertComplete(): void;
  setAuthStatus(authStatus: DippedSmartCardAuth.AuthStatus): void;
  expectGetMachineConfig(machineConfig?: MachineConfig): void;
}

export function createRestoreApiMock(
  apiClient: MockRestoreApiClient = createMockRestoreApiClient()
): RestoreApiMock {
  return {
    apiClient,

    assertComplete: apiClient.assertComplete,

    setAuthStatus(authStatus) {
      apiClient.getAuthStatus.expectRepeatedCallsWith().resolves(authStatus);
    },

    expectGetMachineConfig(
      machineConfig = { machineId: DEV_MACHINE_ID, codeVersion: 'dev' }
    ) {
      apiClient.getMachineConfig.expectCallWith().resolves(machineConfig);
    },
  };
}
