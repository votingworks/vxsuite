import React from 'react';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  InsertedSmartCardAuth,
  PollsState,
  PrecinctSelection,
  PrinterStatus,
} from '@votingworks/types';
import { createMockClient } from '@votingworks/grout-test-utils';
import type {
  Api,
  FujitsuPrintResult,
  FujitsuPrinterStatus,
  MachineConfig,
  OpenPollsResult,
  PollsTransition,
  PrecinctScannerConfig,
  PrecinctScannerStatus,
  PrintResult,
} from '@votingworks/scan-backend';
import { deferred, err, ok } from '@votingworks/basics';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { TestErrorBoundary, mockUsbDriveStatus } from '@votingworks/ui';
import { BROTHER_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import type { BatteryInfo } from '@votingworks/backend';
import { mockPollsInfo } from './mock_polls_info';
import { ApiProvider } from '../../src/api_provider';

export const machineConfig: MachineConfig = {
  machineId: '0002',
  codeVersion: '3.14',
};

const defaultConfig: PrecinctScannerConfig = {
  isSoundMuted: false,
  isMultiSheetDetectionDisabled: false,
  hasPaperBeenLoaded: false,
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

  function setPrinterStatusV3(printerStatus: Partial<PrinterStatus>): void {
    mockApiClient.getPrinterStatus.expectRepeatedCallsWith().resolves({
      scheme: 'hardware-v3',
      connected: true,
      config: BROTHER_THERMAL_PRINTER_CONFIG,
      ...printerStatus,
    });
  }

  function setPrinterStatusV4(
    printerStatus: FujitsuPrinterStatus = { state: 'idle' }
  ): void {
    mockApiClient.getPrinterStatus.expectRepeatedCallsWith().resolves({
      scheme: 'hardware-v4',
      ...printerStatus,
    });
  }

  function setBatteryInfo(batteryInfo?: Partial<BatteryInfo>): void {
    mockApiClient.getBatteryInfo.expectRepeatedCallsWith().resolves({
      level: 1,
      discharging: false,
      ...(batteryInfo ?? {}),
    });
  }

  return {
    mockApiClient,

    setAuthStatus,

    setPrinterStatusV3,
    setPrinterStatusV4,

    setBatteryInfo,

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
      mockApiClient.getUsbDriveStatus.expectRepeatedCallsWith().resolves({
        ...mockUsbDriveStatus(status),
        doesUsbDriveRequireCastVoteRecordSync:
          options.doesUsbDriveRequireCastVoteRecordSync,
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

    expectOpenPolls(result: OpenPollsResult = ok()): void {
      mockApiClient.openPolls.expectCallWith().resolves(result);
    },

    expectClosePolls(): void {
      mockApiClient.closePolls.expectCallWith().resolves();
    },

    expectPauseVoting(): void {
      mockApiClient.pauseVoting.expectCallWith().resolves();
    },

    expectResumeVoting(): void {
      mockApiClient.resumeVoting.expectCallWith().resolves();
    },

    expectResetPollsToPaused(): void {
      mockApiClient.resetPollsToPaused.expectCallWith().resolves();
    },

    expectExportCastVoteRecordsToUsbDrive(): void {
      mockApiClient.exportCastVoteRecordsToUsbDrive
        .expectCallWith()
        .resolves(ok());
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

    expectPrintReportV3(pageCount = 1) {
      mockApiClient.printReport.expectCallWith().resolves({
        scheme: 'hardware-v3',
        pageCount,
      });
    },

    expectPrintReportV4(errorStatus?: FujitsuPrinterStatus): {
      resolve: () => void;
    } {
      const { resolve, promise } = deferred<PrintResult>();

      mockApiClient.printReport.expectCallWith().returns(promise);

      return {
        resolve: () => {
          if (errorStatus) {
            resolve({
              scheme: 'hardware-v4',
              result: err(errorStatus),
            });
          } else {
            resolve({
              scheme: 'hardware-v4',
              result: ok(),
            });
          }
        },
      };
    },

    expectPrintReportSection(
      index: number,
      errorStatus?: FujitsuPrinterStatus
    ): {
      resolve: () => void;
    } {
      const { resolve, promise } = deferred<FujitsuPrintResult>();

      mockApiClient.printReportSection
        .expectCallWith({ index })
        .returns(promise);

      return {
        resolve: () => {
          if (errorStatus) {
            resolve(err(errorStatus));
          } else {
            resolve(ok());
          }
        },
      };
    },

    expectSetHasPaperBeenLoaded(hasPaperBeenLoaded: boolean): void {
      mockApiClient.setHasPaperBeenLoaded
        .expectCallWith({ hasPaperBeenLoaded })
        .resolves();
    },

    expectPrintTestPage(result: FujitsuPrintResult = ok()): void {
      mockApiClient.printTestPage.expectCallWith().resolves(result);
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
