import { screen } from '@testing-library/react';
import type {
  Api,
  AdjudicatedCvrContest,
  BallotCountReportSpec,
  BallotCountReportWarning,
  CastVoteRecordFileMetadata,
  CastVoteRecordFileRecord,
  CvrFileMode,
  MachineConfig,
  MachineRecord,
  ManualResultsIdentifier,
  WriteInCandidateRecord,
  ScannerBatch,
  BallotAdjudicationData,
  BallotAdjudicationQueueMetadata,
  ExportDataError,
  TallyReportSpec,
  TallyReportWarning,
  ManualResultsMetadata,
} from '@votingworks/admin-backend';
import type { BatteryInfo } from '@votingworks/backend';
import type { DiskSpaceSummary } from '@votingworks/utils';
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
  BallotPageLayout,
  BallotStyleGroupId,
  BallotType,
  ContestId,
  ContestOptionId,
  DEFAULT_SYSTEM_SETTINGS,
  DiagnosticRecord,
  DippedSmartCardAuth,
  constructElectionKey,
  ElectionDefinition,
  Id,
  PrinterConfig,
  PrinterStatus,
  Rect,
  SystemSettings,
  Tabulation,
  DEV_MACHINE_ID,
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

type MockApiClient = Omit<
  MockClient<Api>,
  'getBatteryInfo' | 'getDiskSpaceSummary'
> & {
  // Because these are polled so frequently, we opt for a standard vitest mock instead of a
  // libs/test-utils mock since the latter requires every call to be explicitly mocked
  getBatteryInfo: Mock;
  getDiskSpaceSummary: Mock;
};

export function createMockApiClient(): MockApiClient {
  const mockApiClient = createMockClient<Api>();
  // For some reason, using an object spread to override the polling methods breaks the rest
  // of the mockApiClient, so we override like this instead
  (mockApiClient.getBatteryInfo as unknown as Mock) = vi.fn(() =>
    Promise.resolve({ level: 1, discharging: false })
  );
  (mockApiClient.getDiskSpaceSummary as unknown as Mock) = vi.fn(() =>
    Promise.resolve({ total: 3, used: 2, available: 1 })
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
        id?: Id;
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
      contestId?: ContestId
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
      input: { contestId: ContestId; name: string },
      writeInCandidateRecord: WriteInCandidateRecord
    ) {
      apiClient.addWriteInCandidate
        .expectCallWith(input)
        .resolves(writeInCandidateRecord);
    },

    expectGetBallotAdjudicationQueueMetadata(
      metadata: BallotAdjudicationQueueMetadata
    ) {
      return apiClient.getBallotAdjudicationQueueMetadata
        .expectCallWith()
        .resolves(metadata);
    },

    expectGetBallotAdjudicationQueue(cvrIds: Id[]) {
      apiClient.getBallotAdjudicationQueue.expectCallWith().resolves(cvrIds);
    },

    expectGetBallotAdjudicationData(
      input: { cvrId: Id },
      data: BallotAdjudicationData
    ) {
      apiClient.getBallotAdjudicationData.expectCallWith(input).resolves(data);
    },

    expectResolveBallotTags(input: { cvrId: Id }) {
      apiClient.resolveBallotTags.expectCallWith(input).resolves();
    },

    expectGetNextCvrIdForBallotAdjudication(cvrId: Id | null) {
      apiClient.getNextCvrIdForBallotAdjudication
        .expectCallWith()
        .resolves(cvrId);
    },

    expectGetCastVoteRecordVoteInfo(
      input: { cvrId: Id },
      votes: Record<ContestId, ContestOptionId[]>,
      ballotStyleGroupId?: BallotStyleGroupId
    ) {
      apiClient.getCastVoteRecordVoteInfo.expectCallWith(input).resolves({
        votes,
        id: input.cvrId,
        electionId: 'electionId',
        ballotStyleGroupId: ballotStyleGroupId ?? ('1M' as BallotStyleGroupId),
        markScores: null,
      });
    },

    expectGetBallotImages(
      input: { cvrId: Id },
      isBmd: boolean,
      options: { isImageCorrupted?: boolean } = {}
    ) {
      const { cvrId } = input;
      const imageUrl = options.isImageCorrupted
        ? undefined
        : `mock-image-data-${cvrId}-${0}`;
      const ballotCoordinates: Rect = {
        x: 0,
        y: 0,
        width: options.isImageCorrupted ? 0 : 1000,
        height: options.isImageCorrupted ? 0 : 1000,
      };
      if (isBmd) {
        apiClient.getBallotImages.expectCallWith(input).resolves({
          cvrId,
          front: { type: 'bmd', imageUrl, ballotCoordinates },
          back: { type: 'bmd', imageUrl, ballotCoordinates },
        });
      } else {
        const layout: BallotPageLayout = {
          pageSize: { width: 1000, height: 1000 },
          metadata: {
            ballotStyleId: '1M',
            precinctId: 'precinct-1',
            ballotType: BallotType.Precinct,
            ballotHash: 'test-election-hash',
            isTestMode: true,
            pageNumber: 1,
          },
          contests: [
            {
              contestId: 'zoo-council-mammal',
              bounds: { x: 200, y: 200, width: 600, height: 600 },
              corners: [
                { x: 200, y: 200 },
                { x: 800, y: 200 },
                { x: 200, y: 800 },
                { x: 800, y: 800 },
              ],
              options: [
                {
                  definition: {
                    type: 'candidate' as const,
                    id: 'elephant',
                    contestId: 'zoo-council-mammal',
                    name: 'Elephant',
                    isWriteIn: false,
                  },
                  bounds: { x: 200, y: 100, width: 50, height: 30 },
                  target: {
                    bounds: { x: 205, y: 105, width: 10, height: 10 },
                    inner: { x: 207, y: 107, width: 6, height: 6 },
                  },
                },
                {
                  definition: {
                    type: 'candidate' as const,
                    id: 'lion',
                    contestId: 'zoo-council-mammal',
                    name: 'Lion',
                    isWriteIn: false,
                  },
                  bounds: { x: 200, y: 100, width: 50, height: 30 },
                  target: {
                    bounds: { x: 205, y: 105, width: 10, height: 10 },
                    inner: { x: 207, y: 107, width: 6, height: 6 },
                  },
                },
                {
                  definition: {
                    type: 'candidate' as const,
                    id: 'kangaroo',
                    contestId: 'zoo-council-mammal',
                    name: 'Kangaroo',
                    isWriteIn: false,
                  },
                  bounds: { x: 200, y: 100, width: 50, height: 30 },
                  target: {
                    bounds: { x: 205, y: 105, width: 10, height: 10 },
                    inner: { x: 207, y: 107, width: 6, height: 6 },
                  },
                },
                {
                  definition: {
                    type: 'candidate' as const,
                    id: 'write-in-0',
                    contestId: 'zoo-council-mammal',
                    name: 'Write-In Option 0',
                    isWriteIn: true,
                    writeInIndex: 0,
                  },
                  bounds: { x: 400, y: 200, width: 400, height: 200 },
                  target: {
                    bounds: { x: 205, y: 155, width: 10, height: 10 },
                    inner: { x: 207, y: 157, width: 6, height: 6 },
                  },
                },
                {
                  definition: {
                    type: 'candidate' as const,
                    id: 'write-in-1',
                    contestId: 'zoo-council-mammal',
                    name: 'Write-In Option 1',
                    isWriteIn: true,
                    writeInIndex: 0,
                  },
                  bounds: { x: 400, y: 200, width: 400, height: 200 },
                  target: {
                    bounds: { x: 205, y: 155, width: 10, height: 10 },
                    inner: { x: 207, y: 157, width: 6, height: 6 },
                  },
                },
                {
                  definition: {
                    type: 'candidate' as const,
                    id: 'write-in-2',
                    contestId: 'zoo-council-mammal',
                    name: 'Write-In Option 2',
                    isWriteIn: true,
                    writeInIndex: 2,
                  },
                  bounds: { x: 400, y: 200, width: 400, height: 200 },
                  target: {
                    bounds: { x: 205, y: 155, width: 10, height: 10 },
                    inner: { x: 207, y: 157, width: 6, height: 6 },
                  },
                },
              ],
            },
          ],
        };
        apiClient.getBallotImages.expectCallWith(input).resolves({
          cvrId,
          front: {
            type: 'hmpb',
            imageUrl,
            ballotCoordinates,
            layout,
          },
          back: {
            type: 'hmpb',
            imageUrl,
            ballotCoordinates,
            layout,
          },
        });
      }
    },

    expectGetMarginalMarks(
      input: { contestId: ContestId; cvrId: Id },
      marginalMarks: ContestOptionId[]
    ) {
      apiClient.getMarginalMarks.expectCallWith(input).resolves(marginalMarks);
    },

    expectAdjudicateCvrContest(input: AdjudicatedCvrContest) {
      apiClient.adjudicateCvrContest.expectCallWith(input).resolves();
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

    setDiskSpaceSummary(summary?: DiskSpaceSummary) {
      apiClient.getDiskSpaceSummary.mockResolvedValue(
        summary ?? { total: 3, used: 2, available: 1 }
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

    expectGetUsbPortStatus(): void {
      apiClient.getUsbPortStatus.expectCallWith().resolves({ enabled: true });
    },

    expectGetNetworkStatus(
      overrides: {
        isOnline?: boolean;
        connectedClients?: MachineRecord[];
      } = {}
    ): void {
      apiClient.getNetworkStatus.expectRepeatedCallsWith().resolves({
        isOnline: overrides.isOnline ?? true,
        connectedClients: overrides.connectedClients ?? [],
      });
    },

    expectGetIsClientAdjudicationEnabled(enabled = false): void {
      apiClient.getIsClientAdjudicationEnabled
        .expectRepeatedCallsWith()
        .resolves(enabled);
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;
