import React from 'react';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
  ElectionDefinition,
  InsertedSmartCardAuth,
  PollsState,
  PrecinctSelection,
  PrinterStatus,
  DiagnosticRecord,
  DiagnosticOutcome,
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
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { TestErrorBoundary, mockUsbDriveStatus } from '@votingworks/ui';
import { BROTHER_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import type { DiskSpaceSummary, ExportDataResult } from '@votingworks/backend';
import { mockPollsInfo } from './mock_polls_info';
import { ApiProvider } from '../../src/api_provider';

export const machineConfig: MachineConfig = {
  machineId: '0002',
  codeVersion: '3.14',
};

const defaultConfig: PrecinctScannerConfig = {
  isSoundMuted: false,
  isDoubleFeedDetectionDisabled: false,
  isTestMode: true,
  electionDefinition: electionGeneralDefinition,
  electionPackageHash: 'test-election-package-hash',
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
    // Make sure we clear existing mocks in case printer status was set to v4
    mockApiClient.getPrinterStatus.reset();
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
    // Make sure we clear existing mocks in case printer status was set to v3
    mockApiClient.getPrinterStatus.reset();
    mockApiClient.getPrinterStatus.expectRepeatedCallsWith().resolves({
      scheme: 'hardware-v4',
      ...printerStatus,
    });
  }

  return {
    mockApiClient,

    setAuthStatus,

    setPrinterStatusV3,
    setPrinterStatusV4,

    authenticateAsSystemAdministrator() {
      setAuthStatus({
        status: 'logged_in',
        user: mockSystemAdministratorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
    },

    authenticateAsElectionManager(electionDefinition: ElectionDefinition) {
      setAuthStatus({
        status: 'logged_in',
        user: mockElectionManagerUser({
          electionKey: constructElectionKey(electionDefinition.election),
        }),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
    },

    authenticateAsPollWorker(electionDefinition: ElectionDefinition) {
      setAuthStatus({
        status: 'logged_in',
        user: mockPollWorkerUser({
          electionKey: constructElectionKey(electionDefinition.election),
        }),
        sessionExpiresAt: mockSessionExpiresAt(),
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

    expectGenerateSignedHashValidationQrCodeValue() {
      mockApiClient.generateSignedHashValidationQrCodeValue
        .expectCallWith()
        .resolves({
          qrCodeValue: 'qr-code-value',
          signatureInputs: {
            combinedElectionHash: 'combined-election-hash',
            date: new Date('1/1/2024, 12:00:00 PM'),
            machineId: 'machine-id',
            softwareVersion: 'software-version',
            systemHash: 'system-hash',
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

    expectPrintTestPage(result: FujitsuPrintResult = ok()): {
      resolve: () => void;
    } {
      const { resolve, promise } = deferred<FujitsuPrintResult>();

      mockApiClient.printTestPage.expectCallWith().returns(promise);

      return {
        resolve: () => {
          resolve(result);
        },
      };
    },

    expectLogTestPrintOutcome(outcome: 'pass' | 'fail') {
      mockApiClient.logTestPrintOutcome.expectCallWith({ outcome }).resolves();
    },

    expectGetDiskSpaceSummary(summary?: DiskSpaceSummary) {
      mockApiClient.getDiskSpaceSummary.expectCallWith().resolves(
        summary ?? {
          available: 1,
          used: 1,
          total: 2,
        }
      );
    },

    expectGetMostRecentPrinterDiagnostic(
      result: DiagnosticRecord | null = null
    ) {
      mockApiClient.getMostRecentPrinterDiagnostic
        .expectCallWith()
        .resolves(result);
    },

    expectGetMostRecentAudioDiagnostic(result: DiagnosticRecord | null = null) {
      mockApiClient.getMostRecentAudioDiagnostic
        .expectCallWith()
        .resolves(result);
    },

    expectLogAudioDiagnosticOutcome(outcome: DiagnosticOutcome) {
      mockApiClient.logAudioDiagnosticOutcome
        .expectCallWith({ outcome })
        .resolves();
    },

    expectSaveReadinessReport(
      result: ExportDataResult = ok(['/media/vx/usb-drive/report.pdf'])
    ) {
      mockApiClient.saveReadinessReport.expectCallWith().resolves(result);
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
