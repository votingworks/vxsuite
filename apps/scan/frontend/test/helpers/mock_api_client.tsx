import React from 'react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  CastVoteRecord,
  ElectionDefinition,
  InsertedSmartCardAuth,
  MarkThresholds,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import type {
  Api,
  MachineConfig,
  PrecinctScannerConfig,
  PrecinctScannerStatus,
} from '@votingworks/scan-backend';
import { QueryClientProvider } from '@tanstack/react-query';
import { ok } from '@votingworks/basics';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import { ApiClientContext, createQueryClient } from '../../src/api';

export const machineConfig: MachineConfig = {
  machineId: '0002',
  codeVersion: '3.14',
};

const defaultConfig: PrecinctScannerConfig = {
  isSoundMuted: false,
  isUltrasonicDisabled: false,
  isTestMode: true,
  pollsState: 'polls_closed_initial',
  ballotCountWhenBallotBagLastReplaced: 0,
  electionDefinition: electionSampleDefinition,
  precinctSelection: ALL_PRECINCTS_SELECTION,
};

export const statusNoPaper: PrecinctScannerStatus = {
  state: 'no_paper',
  canUnconfigure: false,
  ballotsCounted: 0,
};

type MockApiClient = Omit<MockClient<Api>, 'saveScannerReportDataToCard'> & {
  // Because the values passed to this are so complex, we opt for a standard jest mock instead of a
  // libs/test-utils mock since the latter requires exact input matching and doesn't support
  // matchers like expect.objectContaining
  saveScannerReportDataToCard: jest.Mock;
};

function createMockApiClient(): MockApiClient {
  const mockApiClient = createMockClient<Api>();
  // Because mockApiClient uses a Proxy under the hood, we add an explicit field
  // to the object to override the Proxy implementation.
  (mockApiClient.saveScannerReportDataToCard as unknown as jest.Mock) = jest.fn(
    () => Promise.resolve(ok())
  );
  return mockApiClient as unknown as MockApiClient;
}

/**
 * Creates a VxScan specific wrapper around commonly used methods from the Grout
 * mock API client to make it easier to use for our specific test needs
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createApiMock() {
  const mockApiClient = createMockApiClient();

  function setAuthStatus(authStatus: InsertedSmartCardAuth.AuthStatus): void {
    mockApiClient.getAuthStatus.expectRepeatedCallsWith().resolves(authStatus);
  }

  return {
    mockApiClient,

    setAuthStatus,

    authenticateAsSystemAdministrator() {
      setAuthStatus({
        status: 'logged_in',
        user: fakeSystemAdministratorUser(),
        sessionExpiresAt: fakeSessionExpiresAt(),
      });
    },

    authenticateAsElectionManager(electionDefinition: ElectionDefinition) {
      setAuthStatus({
        status: 'logged_in',
        user: fakeElectionManagerUser({
          electionHash: electionDefinition.electionHash,
        }),
        sessionExpiresAt: fakeSessionExpiresAt(),
      });
    },

    authenticateAsPollWorker(electionDefinition: ElectionDefinition) {
      setAuthStatus({
        status: 'logged_in',
        user: fakePollWorkerUser({
          electionHash: electionDefinition.electionHash,
        }),
        sessionExpiresAt: fakeSessionExpiresAt(),
      });
    },

    removeCard() {
      setAuthStatus({
        status: 'logged_out',
        reason: 'no_card',
      });
    },

    expectGetMachineConfig(): void {
      mockApiClient.getMachineConfig.expectCallWith().resolves(machineConfig);
    },

    expectGetConfig(config: Partial<PrecinctScannerConfig> = {}): void {
      mockApiClient.getConfig.expectCallWith().resolves({
        ...defaultConfig,
        ...config,
      });
    },

    expectSetPrecinct(precinctSelection: PrecinctSelection): void {
      mockApiClient.setPrecinctSelection
        .expectCallWith({ precinctSelection })
        .resolves();
    },

    expectSetTestMode(isTestMode: boolean): void {
      mockApiClient.setTestMode.expectCallWith({ isTestMode }).resolves();
    },

    expectSetMarkThresholdOverrides(
      markThresholdOverrides?: MarkThresholds
    ): void {
      mockApiClient.setMarkThresholdOverrides
        .expectCallWith({ markThresholdOverrides })
        .resolves();
    },

    expectGetScannerStatus(status: PrecinctScannerStatus): void {
      mockApiClient.getScannerStatus.expectRepeatedCallsWith().resolves(status);
    },

    expectSetPollsState(pollsState: PollsState): void {
      mockApiClient.setPollsState.expectCallWith({ pollsState }).resolves();
    },

    expectGetCastVoteRecordsForTally(castVoteRecords: CastVoteRecord[]): void {
      mockApiClient.getCastVoteRecordsForTally
        .expectCallWith()
        .resolves(castVoteRecords);
    },

    expectExportCastVoteRecordsToUsbDrive(): void {
      mockApiClient.exportCastVoteRecordsToUsbDrive
        .expectCallWith()
        .resolves(ok());
    },

    expectCheckCalibrationSupported(supportsCalibration: boolean): void {
      mockApiClient.supportsCalibration
        .expectCallWith()
        .resolves(supportsCalibration);
    },

    expectCheckUltrasonicSupported(supportsUltrasonic: boolean): void {
      mockApiClient.supportsUltrasonic
        .expectCallWith()
        .resolves(supportsUltrasonic);
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;

export function provideApi(
  apiMock: ReturnType<typeof createApiMock>,
  children: React.ReactNode
): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        {children}
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}
