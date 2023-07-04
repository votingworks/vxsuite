import { screen } from '@testing-library/react';
import type {
  Api,
  CastVoteRecordFileMetadata,
  CastVoteRecordFileRecord,
  CvrFileMode,
  MachineConfig,
  ManualResultsIdentifier,
  ManualResultsMetadataRecord,
  WriteInAdjudicationStatus,
  WriteInCandidateRecord,
  WriteInDetailView,
  WriteInRecord,
  WriteInTally,
  WriteInAdjudicatedTally,
  SemsExportableTallies,
  ScannerBatch,
  TallyReportResults,
} from '@votingworks/admin-backend';
import { ok } from '@votingworks/basics';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import {
  BallotPackageExportResult,
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth,
  ElectionDefinition,
  Rect,
  SystemSettings,
  Tabulation,
} from '@votingworks/types';

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

    expectConfigure(electionData: string) {
      apiClient.configure
        .expectCallWith({ electionData })
        .resolves(ok({ electionId: 'anything' }));
    },

    expectUnconfigure() {
      apiClient.unconfigure.expectCallWith().resolves();
    },

    expectSetSystemSettings(systemSettings: string) {
      apiClient.setSystemSettings
        .expectCallWith({ systemSettings })
        .resolves(ok({}));
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

    expectGetWriteInTallies(
      writeInTallies: WriteInTally[],
      status?: WriteInAdjudicationStatus
    ) {
      if (status) {
        apiClient.getWriteInTallies
          .expectCallWith({
            status,
          })
          .resolves(writeInTallies);
      } else {
        apiClient.getWriteInTallies.expectCallWith().resolves(writeInTallies);
      }
    },

    expectGetWriteInTalliesAdjudicated(
      writeInTallies: WriteInAdjudicatedTally[]
    ) {
      apiClient.getWriteInTallies
        .expectCallWith({
          status: 'adjudicated',
        })
        .resolves(writeInTallies);
    },

    expectGetWriteIns(writeInRecords: WriteInRecord[], contestId?: string) {
      if (contestId) {
        apiClient.getWriteIns
          .expectCallWith({ contestId })
          .resolves(writeInRecords);
      } else {
        apiClient.getWriteIns.expectCallWith().resolves(writeInRecords);
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

    expectGetWriteInDetailView(
      writeInId: string,
      detailView: Partial<WriteInDetailView> = {}
    ) {
      apiClient.getWriteInDetailView.expectCallWith({ writeInId }).resolves({
        imageUrl: 'WW91IGJlIGdvb2QsIEkgbG92ZSB5b3UuIFNlZSB5b3UgdG9tb3Jyb3cu',
        ballotCoordinates: mockRect,
        contestCoordinates: mockRect,
        writeInCoordinates: mockRect,
        markedOfficialCandidateIds: [],
        writeInAdjudicatedOfficialCandidateIds: [],
        writeInAdjudicatedWriteInCandidateIds: [],
        ...detailView,
      });
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

    expectSaveBallotPackageToUsb(result: BallotPackageExportResult = ok()) {
      apiClient.saveBallotPackageToUsb.expectCallWith().resolves(result);
    },

    expectExportBatchResults(path: string) {
      apiClient.exportBatchResults.expectCallWith({ path }).resolves(ok([]));
    },

    expectGetSemsExportableTallies(result: SemsExportableTallies) {
      apiClient.getSemsExportableTallies.expectCallWith().resolves(result);
    },

    expectExportResultsCsv(path: string) {
      apiClient.exportResultsCsv.expectCallWith({ path }).resolves(ok([]));
    },

    expectGetCardCounts(
      groupBy: Tabulation.GroupBy,
      result: Array<Tabulation.GroupOf<Tabulation.CardCounts>>
    ) {
      apiClient.getCardCounts.expectCallWith({ groupBy }).resolves(result);
    },

    expectGetScannerBatches(result: ScannerBatch[]) {
      apiClient.getScannerBatches.expectCallWith().resolves(result);
    },

    expectGetResultsForTallyReports(
      input: {
        filter?: Tabulation.Filter;
        groupBy?: Tabulation.GroupBy;
      },
      results: Array<Tabulation.GroupOf<TallyReportResults>>
    ) {
      apiClient.getResultsForTallyReports
        .expectCallWith(input)
        .resolves(results);
    },

    expectGetElectionWriteInSummary(
      summary: Tabulation.ElectionWriteInSummary
    ) {
      apiClient.getElectionWriteInSummary.expectCallWith().resolves(summary);
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;
