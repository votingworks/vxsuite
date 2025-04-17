import { screen } from '@testing-library/react';
import type {
  Api,
  BallotCountReportSpec,
  BallotCountReportWarning,
  CastVoteRecordFileMetadata,
  CastVoteRecordFileRecord,
  CvrFileMode,
  MachineConfig,
  ManualResultsIdentifier,
  WriteInCandidateRecord,
  ScannerBatch,
  WriteInAdjudicationQueueMetadata,
  ExportDataError,
  TallyReportSpec,
  TallyReportWarning,
  ManualResultsMetadata,
  WriteInRecord,
  VoteAdjudication,
  WriteInAdjudicationAction,
  AdjudicatedCvrContest,
} from '@votingworks/admin-backend';
import type { BatteryInfo, DiskSpaceSummary } from '@votingworks/backend';
import { FileSystemEntry, FileSystemEntryType } from '@votingworks/fs';
import { Result, deferred, ok } from '@votingworks/basics';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import { Buffer } from 'node:buffer';
import {
  MockFunction,
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
  mockVendorUser,
} from '@votingworks/test-utils';
import {
  Admin,
  ContestId,
  DEFAULT_SYSTEM_SETTINGS,
  DiagnosticRecord,
  DippedSmartCardAuth,
  constructElectionKey,
  ElectionDefinition,
  Id,
  PrinterConfig,
  PrinterStatus,
  SystemSettings,
  Tabulation,
  DEV_MACHINE_ID,
  ContestOptionId,
} from '@votingworks/types';
import { mockUsbDriveStatus } from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { Mock, vi } from 'vitest';

// the below is copied from libs/printing to avoid importing a backend package
export const MOCK_PRINTER_CONFIG: PrinterConfig = {
  label: 'HP LaserJet Pro M404n',
  vendorId: 1008,
  productId: 49450,
  baseDeviceUri: 'usb://HP/LaserJet%20Pro%20M404-M405',
  ppd: 'generic-postscript-driver.ppd',
  supportsIpp: true,
};

type MockApiClient = Omit<MockClient<Api>, 'getBatteryInfo'> & {
  // Because this is polled so frequently, we opt for a standard vitest mock instead of a
  // libs/test-utils mock since the latter requires every call to be explicitly mocked
  getBatteryInfo: Mock;
};

export function createMockApiClient(): MockApiClient {
  const mockApiClient = createMockClient<Api>();
  // For some reason, using an object spread to override the polling methods breaks the rest
  // of the mockApiClient, so we override like this instead
  (mockApiClient.getBatteryInfo as unknown as Mock) = vi.fn(() =>
    Promise.resolve({ level: 1, discharging: false })
  );
  return mockApiClient as unknown as MockApiClient;
}

/**
 * Takes an API client mock function and returns a function that can be used to
 * expect a call with a specific parameter and return a specific value, with
 * the option to defer the resolution. Useful for testing loading states.
 *
 * @example
 *
 * const { resolve } = expectPrintTallyReport({
 *  expectCallWith: reportSpec,
 *  returnValue: ok([]),
 *  defer: true,
 * })
 *
 * userEvent.click(screen.getButton('Print'));
 * await screen.findByText('Printing');
 * resolve();
 * await screen.findByText('Printed');
 */
function createDeferredMock<T, U>(
  fn: MockFunction<(callsWith: T) => Promise<U>>
): (params: { expectCallWith: T; returnValue: U; deferred?: boolean }) => {
  resolve: () => void;
} {
  return (params: {
    expectCallWith: T;
    returnValue: U;
    deferred?: boolean;
  }) => {
    const { promise, resolve } = deferred<U>();
    fn.expectCallWith(params.expectCallWith).returns(promise);

    if (!params.deferred) {
      resolve(params.returnValue);
    }

    return {
      resolve: () => {
        resolve(params.returnValue);
      },
    };
  };
}

/**
 * Creates a VxAdmin specific wrapper around commonly used methods from the Grout
 * mock API client to make it easier to use for our specific test needs
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createApiMock(
  apiClient: MockApiClient = createMockApiClient()
) {
  function setPrinterStatus(printerStatus: Partial<PrinterStatus> = {}): void {
    apiClient.getPrinterStatus.expectRepeatedCallsWith().resolves({
      connected: true,
      config: MOCK_PRINTER_CONFIG,
      ...printerStatus,
    });
  }

  return {
    apiClient,

    assertComplete: apiClient.assertComplete,

    setAuthStatus(authStatus: DippedSmartCardAuth.AuthStatus) {
      apiClient.getAuthStatus.expectRepeatedCallsWith().resolves(authStatus);
    },

    setPrinterStatus,

    async authenticateAsVendor() {
      // First verify that we're logged out
      await screen.findByText('VxAdmin Locked');
      this.setAuthStatus({
        status: 'logged_in',
        user: mockVendorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
      await screen.findByText('Lock Machine');
    },

    async authenticateAsSystemAdministrator() {
      // first verify that we're logged out
      await screen.findByText('VxAdmin Locked');
      this.setAuthStatus({
        status: 'logged_in',
        user: mockSystemAdministratorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
        programmableCard: { status: 'no_card' },
      });
      await screen.findByText('Lock Machine');
    },

    async authenticateAsElectionManager(
      electionDefinition: ElectionDefinition
    ) {
      // first verify that we're logged out
      await screen.findByText('VxAdmin Locked');
      this.setAuthStatus({
        status: 'logged_in',
        user: mockElectionManagerUser({
          electionKey: constructElectionKey(electionDefinition.election),
        }),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
      await screen.findByText('Lock Machine');
    },

    async logOut() {
      this.setAuthStatus({
        status: 'logged_out',
        reason: 'machine_locked',
      });
      await screen.findByText('VxAdmin Locked');
    },

    expectCheckPin(pin: string) {
      apiClient.checkPin.expectCallWith({ pin }).resolves();
    },

    expectLogOut() {
      apiClient.logOut.expectCallWith().resolves();
    },

    expectProgramCard(
      userRole: 'system_administrator' | 'election_manager' | 'poll_worker',
      newPin?: string
    ) {
      apiClient.programCard
        .expectCallWith({ userRole })
        .resolves(ok({ pin: newPin }));
    },

    expectUnprogramCard() {
      apiClient.unprogramCard.expectCallWith().resolves(ok());
    },

    expectGetMachineConfig(
      machineConfig: MachineConfig = {
        machineId: DEV_MACHINE_ID,
        codeVersion: 'dev',
      }
    ) {
      apiClient.getMachineConfig.expectCallWith().resolves(machineConfig);
    },

    setBatteryInfo(batteryInfo?: Partial<BatteryInfo>) {
      apiClient.getBatteryInfo.mockResolvedValue({
        level: 0.5,
        discharging: false,
        ...(batteryInfo || {}),
      });
    },

    expectGetUsbDriveStatus(status: UsbDriveStatus['status']): void {
      apiClient.getUsbDriveStatus
        .expectRepeatedCallsWith()
        .resolves(mockUsbDriveStatus(status));
    },

    expectEjectUsbDrive(): void {
      apiClient.ejectUsbDrive.expectCallWith().resolves();
    },

    expectFormatUsbDrive(): void {
      apiClient.formatUsbDrive.expectCallWith().resolves(ok());
    },

    expectGetCurrentElectionMetadata(
      metadata?: {
        electionDefinition: ElectionDefinition;
        isOfficialResults?: boolean;
        id?: string;
        createdAt?: string;
        electionPackageHash?: string;
      } | null
    ) {
      apiClient.getCurrentElectionMetadata.expectCallWith().resolves(
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

    expectListPotentialElectionPackagesOnUsbDrive(
      electionPackages: Array<Partial<FileSystemEntry>> = []
    ) {
      apiClient.listPotentialElectionPackagesOnUsbDrive
        .expectCallWith()
        .resolves(
          ok(
            electionPackages.map((entry) => ({
              name: 'Test Election Package',
              path: 'package.zip',
              type: FileSystemEntryType.File,
              size: 1,
              mtime: new Date(),
              atime: new Date(),
              ctime: new Date(),
              ...entry,
            }))
          )
        );
    },

    expectConfigure(electionFilePath: string) {
      apiClient.configure
        .expectCallWith({ electionFilePath })
        .resolves(ok({ electionId: 'anything' }));
    },

    expectUnconfigure() {
      apiClient.unconfigure.expectCallWith().resolves();
    },

    expectGetSystemSettings(systemSettings?: SystemSettings) {
      apiClient.getSystemSettings
        .expectCallWith()
        .resolves(systemSettings ?? DEFAULT_SYSTEM_SETTINGS);
    },

    expectGetCastVoteRecordFileMode(fileMode: CvrFileMode) {
      apiClient.getCastVoteRecordFileMode.expectCallWith().resolves(fileMode);
    },

    expectGetCastVoteRecordFiles(fileRecords: CastVoteRecordFileRecord[]) {
      apiClient.getCastVoteRecordFiles.expectCallWith().resolves(fileRecords);
    },

    expectGetWriteInCandidates(
      writeInCandidates: WriteInCandidateRecord[],
      contestId?: string
    ) {
      if (contestId) {
        apiClient.getWriteInCandidates
          .expectCallWith({ contestId })
          .resolves(writeInCandidates);
      } else {
        apiClient.getWriteInCandidates
          .expectCallWith()
          .resolves(writeInCandidates);
      }
    },

    expectAddWriteInCandidate(
      input: { contestId: string; name: string },
      writeInCandidateRecord: WriteInCandidateRecord
    ) {
      apiClient.addWriteInCandidate
        .expectCallWith(input)
        .resolves(writeInCandidateRecord);
    },

    expectGetCvrContestWriteInImageViews(
      input: { contestId: string; cvrId: string },
      isBmd: boolean,
      numImages: number = 1
    ) {
      const { cvrId } = input;
      if (isBmd) {
        apiClient.getCvrContestWriteInImageViews.expectCallWith(input).resolves(
          Array.from({ length: numImages }).map((_, idx) => ({
            cvrId,
            imageUrl: `mock-image-data-${cvrId}-${idx}`,
            machineMarkedText: 'machine-marked-mock-text',
            type: 'bmd',
            side: 'front',
            optionId: `write-in-${idx}`,
            writeInId: `write-in-${idx}`,
          }))
        );
      } else {
        apiClient.getCvrContestWriteInImageViews.expectCallWith(input).resolves(
          Array.from({ length: numImages }).map((_, idx) => ({
            cvrId,
            optionId: `write-in-${idx}`,
            writeInId: `write-in-${idx}`,
            imageUrl: `mock-image-data-${cvrId}-${idx}`,
            type: 'hmpb',
            side: 'front',
            ballotCoordinates: {
              x: 0,
              y: 0,
              width: 1000,
              height: 1000,
            },
            contestCoordinates: {
              x: 200,
              y: 200,
              width: 600,
              height: 600,
            },
            writeInCoordinates: {
              x: 400,
              y: 200,
              width: 600,
              height: 200,
            },
          }))
        );
      }
    },

    expectGetWriteInAdjudicationCvrQueueMetadata(
      queueMetadata: WriteInAdjudicationQueueMetadata[]
    ) {
      return apiClient.getWriteInAdjudicationCvrQueueMetadata
        .expectCallWith()
        .resolves(queueMetadata);
    },

    expectGetWriteInAdjudicationCvrQueue(
      input: { contestId: string },
      cvrIds: Id[]
    ) {
      apiClient.getWriteInAdjudicationCvrQueue
        .expectCallWith(input)
        .resolves(cvrIds);
    },

    expectGetFirstPendingWriteInCvrId(
      input: { contestId: string },
      cvrId: string | null
    ) {
      apiClient.getFirstPendingWriteInCvrId
        .expectCallWith(input)
        .resolves(cvrId);
    },

    expectGetCastVoteRecordVoteInfo(
      input: { cvrId: string },
      votes: Record<ContestId, ContestOptionId[]>
    ) {
      apiClient.getCastVoteRecordVoteInfo
        .expectCallWith(input)
        .resolves({ votes, id: 'id', electionId: 'electionId' });
    },

    expectGetWriteIns(
      input: { contestId: string; cvrId: string },
      writeIns: WriteInRecord[]
    ) {
      apiClient.getWriteIns.expectCallWith(input).resolves(writeIns);
    },

    expectGetVoteAdjudications(
      input: { contestId: string; cvrId: string },
      voteAdjudications: VoteAdjudication[]
    ) {
      apiClient.getVoteAdjudications
        .expectCallWith(input)
        .resolves(voteAdjudications);
    },

    expectAdjudicateCvrContest(input: AdjudicatedCvrContest) {
      apiClient.adjudicateCvrContest.expectCallWith(input).resolves();
    },

    expectAdjudicateWriteIn(input: WriteInAdjudicationAction) {
      apiClient.adjudicateWriteIn.expectCallWith(input).resolves();
    },

    expectMarkResultsOfficial() {
      apiClient.markResultsOfficial.expectCallWith().resolves();
    },

    expectClearCastVoteRecordFiles() {
      apiClient.clearCastVoteRecordFiles.expectCallWith().resolves();
    },

    expectListCastVoteRecordFilesOnUsb(files: CastVoteRecordFileMetadata[]) {
      apiClient.listCastVoteRecordFilesOnUsb.expectCallWith().resolves(files);
    },

    expectDeleteAllManualResults() {
      apiClient.deleteAllManualResults.expectCallWith().resolves();
    },

    expectDeleteManualResults(input: ManualResultsIdentifier) {
      apiClient.deleteManualResults.expectCallWith(input).resolves();
    },

    expectSetManualResults(
      input: ManualResultsIdentifier & {
        manualResults: Tabulation.ManualElectionResults;
      }
    ) {
      apiClient.setManualResults.expectCallWith(input).resolves();
    },

    expectGetManualResults(
      input: ManualResultsIdentifier,
      results?: Tabulation.ManualElectionResults
    ) {
      apiClient.getManualResults.expectCallWith(input).resolves(
        results
          ? {
              ...input,
              manualResults: results,
              createdAt: new Date().toISOString(),
            }
          : null
      );
    },

    expectImportElectionResultReportingFileMutation(
      input: ManualResultsIdentifier & {
        filepath: string;
      }
    ) {
      apiClient.importElectionResultsReportingFile
        .expectCallWith(input)
        .resolves(ok());
    },

    expectGetManualResultsMetadata(records: ManualResultsMetadata[]) {
      apiClient.getManualResultsMetadata.expectCallWith().resolves(records);
    },

    expectSaveElectionPackageToUsb(
      result: Result<void, ExportDataError> = ok()
    ) {
      apiClient.saveElectionPackageToUsb.expectCallWith().resolves(result);
    },

    expectGetTotalBallotCount(count: number, deferResult = false) {
      const { promise, resolve } = deferred<number>();

      apiClient.getTotalBallotCount.expectCallWith().returns(promise);

      if (!deferResult) {
        resolve(count);
      }

      return {
        resolve: () => {
          resolve(count);
        },
      };
    },

    expectGetScannerBatches(result: ScannerBatch[]) {
      apiClient.getScannerBatches.expectCallWith().resolves(result);
    },

    expectGetMostRecentPrinterDiagnostic(
      result: DiagnosticRecord | null = null
    ) {
      apiClient.getMostRecentPrinterDiagnostic
        .expectCallWith()
        .resolves(result);
    },

    expectAddDiagnosticRecord(record: Omit<DiagnosticRecord, 'timestamp'>) {
      apiClient.addDiagnosticRecord.expectCallWith(record).resolves();
    },

    expectGetApplicationDiskSpaceSummary(summary?: DiskSpaceSummary) {
      apiClient.getApplicationDiskSpaceSummary.expectCallWith().resolves(
        summary ?? {
          available: 1,
          used: 1,
          total: 2,
        }
      );
    },

    expectGetResultsForTallyReports(
      input: {
        filter: Admin.FrontendReportingFilter;
        groupBy: Tabulation.GroupBy;
      },
      results: Tabulation.GroupList<Admin.TallyReportResults>,
      deferResult = false
    ) {
      const { promise, resolve } =
        deferred<Tabulation.GroupList<Admin.TallyReportResults>>();
      apiClient.getResultsForTallyReports
        .expectCallWith(input)
        .returns(promise);

      if (!deferResult) {
        resolve(results);
      }

      return {
        resolve: () => {
          resolve(results);
        },
      };
    },

    expectGetTallyReportPreview({
      reportSpec,
      warning,
      pdfContent,
    }: {
      reportSpec: TallyReportSpec;
      warning?: TallyReportWarning;
      pdfContent?: string;
    }) {
      apiClient.getTallyReportPreview.expectCallWith(reportSpec).resolves({
        pdf: pdfContent ? Buffer.from(pdfContent) : undefined,
        warning,
      });
    },

    expectPrintTallyReport: createDeferredMock(apiClient.printTallyReport),
    expectExportTallyReportPdf: createDeferredMock(
      apiClient.exportTallyReportPdf
    ),
    expectExportTallyReportCsv: createDeferredMock(
      apiClient.exportTallyReportCsv
    ),
    expectExportCdfReport: createDeferredMock(
      apiClient.exportCdfElectionResultsReport
    ),

    expectGetBallotCountReportPreview({
      reportSpec,
      warning,
      pdfContent,
    }: {
      reportSpec: BallotCountReportSpec;
      warning?: BallotCountReportWarning;
      pdfContent?: string;
    }) {
      apiClient.getBallotCountReportPreview
        .expectCallWith(reportSpec)
        .resolves({
          pdf: pdfContent ? Buffer.from(pdfContent) : undefined,
          warning,
        });
    },

    expectPrintBallotCountReport: createDeferredMock(
      apiClient.printBallotCountReport
    ),
    expectExportBallotCountReportPdf: createDeferredMock(
      apiClient.exportBallotCountReportPdf
    ),
    expectExportBallotCountReportCsv: createDeferredMock(
      apiClient.exportBallotCountReportCsv
    ),

    expectGetWriteInAdjudicationReportPreview(pdfContent: string) {
      apiClient.getWriteInAdjudicationReportPreview
        .expectCallWith()
        .resolves({ pdf: Buffer.from(pdfContent) });
    },

    expectPrintWriteInAdjudicationReport: createDeferredMock(
      apiClient.printWriteInAdjudicationReport
    ),
    expectExportWriteInAdjudicationReportPdf: createDeferredMock(
      apiClient.exportWriteInAdjudicationReportPdf
    ),

    expectRebootToVendorMenu() {
      apiClient.rebootToVendorMenu.expectCallWith().resolves();
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;
