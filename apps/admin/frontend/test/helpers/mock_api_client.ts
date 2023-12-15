import { screen } from '@testing-library/react';
import type {
  Api,
  CastVoteRecordFileMetadata,
  CastVoteRecordFileRecord,
  CvrFileMode,
  MachineConfig,
  ManualResultsIdentifier,
  ManualResultsMetadataRecord,
  WriteInCandidateRecord,
  WriteInAdjudicationContext,
  ScannerBatch,
  TallyReportResults,
  WriteInAdjudicationQueueMetadata,
  WriteInImageView,
  ExportDataError,
} from '@votingworks/admin-backend';
import { FileSystemEntry, FileSystemEntryType } from '@votingworks/backend';
import { Result, deferred, ok } from '@votingworks/basics';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import {
  Admin,
  ContestId,
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth,
  Election,
  ElectionDefinition,
  Id,
  Rect,
  SystemSettings,
  Tabulation,
} from '@votingworks/types';
import { mockUsbDriveStatus } from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';

const mockRect: Rect = {
  width: 1000,
  height: 1000,
  x: 0,
  y: 0,
};

export type MockApiClient = MockClient<Api>;

export function createMockApiClient(): MockApiClient {
  return createMockClient<Api>();
}

/**
 * Creates a VxAdmin specific wrapper around commonly used methods from the Grout
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

    async authenticateAsSystemAdministrator() {
      // first verify that we're logged out
      await screen.findByText('VxAdmin is Locked');
      this.setAuthStatus({
        status: 'logged_in',
        user: fakeSystemAdministratorUser(),
        sessionExpiresAt: fakeSessionExpiresAt(),
        programmableCard: { status: 'no_card' },
      });
      await screen.findByText('Lock Machine');
    },

    async authenticateAsElectionManager(
      electionDefinition: ElectionDefinition
    ) {
      // first verify that we're logged out
      await screen.findByText('VxAdmin is Locked');

      this.setAuthStatus({
        status: 'logged_in',
        user: fakeElectionManagerUser({
          electionHash: electionDefinition.electionHash,
        }),
        sessionExpiresAt: fakeSessionExpiresAt(),
      });
      await screen.findByText('Lock Machine');
    },

    async logOut() {
      this.setAuthStatus({
        status: 'logged_out',
        reason: 'machine_locked',
      });
      await screen.findByText('VxAdmin is Locked');
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
        machineId: '0000',
        codeVersion: 'dev',
      }
    ) {
      apiClient.getMachineConfig.expectCallWith().resolves(machineConfig);
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
      } | null
    ) {
      apiClient.getCurrentElectionMetadata.expectCallWith().resolves(
        metadata
          ? {
              id: 'election-id',
              createdAt: new Date().toISOString(),
              isOfficialResults: false,
              ...metadata,
            }
          : null
      );
    },

    expectListPotentialElectionPackagesOnUsbDrive(
      electionPackages: Array<{
        file: Partial<FileSystemEntry>;
        election: Election;
      }> = []
    ) {
      apiClient.listPotentialElectionPackagesOnUsbDrive
        .expectCallWith()
        .resolves(
          ok(
            electionPackages.map((entry) => ({
              file: {
                name: 'Test Election Package',
                path: 'package.zip',
                type: FileSystemEntryType.File,
                size: 1,
                mtime: new Date(),
                atime: new Date(),
                ctime: new Date(),
                ...entry.file,
              },
              election: entry.election,
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

    expectGetWriteInAdjudicationQueueMetadata(
      queueMetadata: WriteInAdjudicationQueueMetadata[],
      contestId?: ContestId
    ) {
      if (contestId) {
        apiClient.getWriteInAdjudicationQueueMetadata
          .expectCallWith({
            contestId,
          })
          .resolves(queueMetadata);
      } else {
        apiClient.getWriteInAdjudicationQueueMetadata
          .expectCallWith()
          .resolves(queueMetadata);
      }
    },

    expectGetWriteInAdjudicationQueue(writeInIds: Id[], contestId?: string) {
      if (contestId) {
        apiClient.getWriteInAdjudicationQueue
          .expectCallWith({ contestId })
          .resolves(writeInIds);
      } else {
        apiClient.getWriteInAdjudicationQueue
          .expectCallWith()
          .resolves(writeInIds);
      }
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

    expectGetWriteInImageView(
      writeInId: string,
      imageView: Partial<WriteInImageView> = {}
    ) {
      apiClient.getWriteInImageView.expectCallWith({ writeInId }).resolves({
        writeInId,
        cvrId: 'id',
        imageUrl: 'WW91IGJlIGdvb2QsIEkgbG92ZSB5b3UuIFNlZSB5b3UgdG9tb3Jyb3cu',
        ballotCoordinates: mockRect,
        contestCoordinates: mockRect,
        writeInCoordinates: mockRect,
        ...imageView,
      });
    },

    expectGetWriteInAdjudicationContext(
      writeInId: string,
      adjudicationContext: Partial<WriteInAdjudicationContext> = {}
    ) {
      apiClient.getWriteInAdjudicationContext
        .expectCallWith({ writeInId })
        .resolves({
          writeIn: {
            id: writeInId,
            contestId: 'id',
            electionId: 'id',
            cvrId: 'id',
            optionId: 'id',
            status: 'pending',
          },
          relatedWriteIns: [],
          cvrId: 'id',
          cvrVotes: {},
          ...adjudicationContext,
        });
    },

    expectGetFirstPendingWriteInId(
      contestId: string,
      writeInId: string | null
    ) {
      apiClient.getFirstPendingWriteInId
        .expectCallWith({ contestId })
        .resolves(writeInId);
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

    expectGetManualResultsMetadata(records: ManualResultsMetadataRecord[]) {
      apiClient.getManualResultsMetadata.expectCallWith().resolves(records);
    },

    expectSaveElectionPackageToUsb(
      result: Result<void, ExportDataError> = ok()
    ) {
      apiClient.saveElectionPackageToUsb.expectCallWith().resolves(result);
    },

    expectExportTallyReportCsv({
      path,
      filter,
      groupBy,
    }: {
      path: string;
      filter?: Admin.FrontendReportingFilter;
      groupBy?: Tabulation.GroupBy;
    }) {
      apiClient.exportTallyReportCsv
        .expectCallWith({ path, groupBy, filter })
        .resolves(ok([]));
    },

    expectExportBallotCountReportCsv({
      path,
      filter,
      groupBy,
      includeSheetCounts,
    }: {
      path: string;
      filter?: Admin.FrontendReportingFilter;
      groupBy?: Tabulation.GroupBy;
      includeSheetCounts?: boolean;
    }) {
      apiClient.exportBallotCountReportCsv
        .expectCallWith({
          path,
          groupBy,
          filter,
          includeSheetCounts: Boolean(includeSheetCounts),
        })
        .resolves(ok([]));
    },

    expectExportCdfElectionResultsReport({ path }: { path: string }) {
      apiClient.exportCdfElectionResultsReport
        .expectCallWith({ path })
        .resolves(ok([]));
    },

    expectGetCardCounts(
      input: {
        filter?: Admin.FrontendReportingFilter;
        groupBy?: Tabulation.GroupBy;
      },
      results: Array<Tabulation.GroupOf<Tabulation.CardCounts>>,
      deferResult = false
    ) {
      const { promise, resolve } =
        deferred<Tabulation.GroupList<Tabulation.CardCounts>>();

      apiClient.getCardCounts.expectCallWith(input).returns(promise);

      if (!deferResult) {
        resolve(results);
      }

      return {
        resolve: () => {
          resolve(results);
        },
      };
    },

    expectGetScannerBatches(result: ScannerBatch[]) {
      apiClient.getScannerBatches.expectCallWith().resolves(result);
    },

    expectGetResultsForTallyReports(
      input: {
        filter?: Admin.FrontendReportingFilter;
        groupBy?: Tabulation.GroupBy;
      },
      results: Tabulation.GroupList<TallyReportResults>,
      deferResult = false
    ) {
      const { promise, resolve } =
        deferred<Tabulation.GroupList<TallyReportResults>>();
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

    expectGetElectionWriteInSummary(
      summary: Tabulation.ElectionWriteInSummary
    ) {
      apiClient.getElectionWriteInSummary.expectCallWith().resolves(summary);
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;
