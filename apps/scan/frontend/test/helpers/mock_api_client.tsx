import React from 'react';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  InsertedSmartCardAuth,
  PollsState,
  PollsTransitionType,
  PrecinctSelection,
} from '@votingworks/types';
import { createMockClient } from '@votingworks/grout-test-utils';
import type {
  Api,
  MachineConfig,
  PollsTransition,
  PrecinctScannerConfig,
  PrecinctScannerStatus,
} from '@votingworks/scan-backend';
import { ok } from '@votingworks/basics';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { TestErrorBoundary } from '@votingworks/ui';
import {
  BROTHER_THERMAL_PRINTER_CONFIG,
  type PrinterStatus,
} from '@votingworks/printing';
import { mockUsbDriveStatus } from './mock_usb_drive';
import { getCurrentTime } from '../../src/utils/get_current_time';
import { mockPollsInfo } from './mock_polls_info';
import { ApiProvider } from '../../src/api_provider';

export const machineConfig: MachineConfig = {
  machineId: '0002',
  codeVersion: '3.14',
};

const defaultConfig: PrecinctScannerConfig = {
  isSoundMuted: false,
  isUltrasonicDisabled: false,
  isTestMode: true,
  ballotCountWhenBallotBagLastReplaced: 0,
  electionDefinition: electionGeneralDefinition,
  precinctSelection: ALL_PRECINCTS_SELECTION,
  systemSettings: DEFAULT_SYSTEM_SETTINGS,
};

export const statusNoPaper: PrecinctScannerStatus = {
  state: 'no_paper',
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

  function setPrinterStatus(printerStatus: Partial<PrinterStatus>): void {
    mockApiClient.getPrinterStatus.expectRepeatedCallsWith().resolves({
      connected: true,
      config: BROTHER_THERMAL_PRINTER_CONFIG,
      ...printerStatus,
    });
  }

  return {
    mockApiClient,

    setAuthStatus,

    setPrinterStatus,

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

    expectGetUsbDriveStatus(
      status: UsbDriveStatus['status'],
      options: { doesUsbDriveRequireCastVoteRecordSync?: true } = {}
    ): void {
      mockApiClient.getUsbDriveStatus
        .expectRepeatedCallsWith()
        .resolves(mockUsbDriveStatus(status, options));
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

    expectGetPollsInfo(
      pollsState?: PollsState,
      lastPollsTransition?: Partial<PollsTransition>
    ): void {
      mockApiClient.getPollsInfo
        .expectCallWith()
        .resolves(
          mockPollsInfo(
            pollsState ?? 'polls_closed_initial',
            lastPollsTransition
          )
        );
    },

    expectSetPrecinct(precinctSelection: PrecinctSelection): void {
      mockApiClient.setPrecinctSelection
        .expectCallWith({ precinctSelection })
        .resolves();
    },

    expectSetTestMode(isTestMode: boolean): void {
      mockApiClient.setTestMode.expectCallWith({ isTestMode }).resolves();
    },

    expectGetScannerStatus(status: PrecinctScannerStatus): void {
      mockApiClient.getScannerStatus.expectRepeatedCallsWith().resolves(status);
    },

    expectTransitionPolls(expectedTransitionType: PollsTransitionType): void {
      mockApiClient.transitionPolls
        .expectCallWith({
          type: expectedTransitionType,
          time: getCurrentTime(),
        })
        .resolves();
    },

    expectExportCastVoteRecordsToUsbDrive(input: {
      mode: 'full_export' | 'polls_closing';
    }): void {
      mockApiClient.exportCastVoteRecordsToUsbDrive
        .expectCallWith(input)
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

    expectPrintReport(numPages = 1) {
      mockApiClient.printReport.expectCallWith().resolves(numPages);
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;

export function provideApi(
  apiMock: ReturnType<typeof createApiMock>,
  children: React.ReactNode
): JSX.Element {
  return (
    <TestErrorBoundary>
      <ApiProvider apiClient={apiMock.mockApiClient}>{children}</ApiProvider>
    </TestErrorBoundary>
  );
}
