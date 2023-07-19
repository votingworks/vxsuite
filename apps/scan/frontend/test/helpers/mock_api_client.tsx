import React from 'react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  CastVoteRecord,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  InsertedSmartCardAuth,
  MarkThresholds,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import { createMockClient } from '@votingworks/grout-test-utils';
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
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { ApiClientContext, createQueryClient } from '../../src/api';
import { fakeUsbDriveStatus } from './fake_usb_drive';

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
  systemSettings: DEFAULT_SYSTEM_SETTINGS,
};

export const statusNoPaper: PrecinctScannerStatus = {
  state: 'no_paper',
  canUnconfigure: false,
  ballotsCounted: 0,
};

/**
 * Creates a VxScan specific wrapper around commonly used methods from the Grout
 * mock API client to make it easier to use for our specific test needs
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createApiMock() {
  const mockApiClient = createMockClient<Api>();

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

    expectGetUsbDriveStatus(status: UsbDriveStatus['status']): void {
      mockApiClient.getUsbDriveStatus
        .expectRepeatedCallsWith()
        .resolves(fakeUsbDriveStatus(status));
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

    expectCheckUltrasonicSupported(supportsUltrasonic: boolean): void {
      mockApiClient.supportsUltrasonic
        .expectCallWith()
        .resolves(supportsUltrasonic);
    },

    expectLogOut() {
      mockApiClient.logOut.expectCallWith().resolves();
    },

    expectGenerateLiveCheckQrCodeValue() {
      mockApiClient.generateLiveCheckQrCodeValue.expectCallWith().resolves({
        qrCodeValue: 'qrCodeValue',
        signatureInputs: {
          machineId: 'machineId',
          date: new Date(),
          electionHashPrefix: 'electionHashPrefix',
        },
      });
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
