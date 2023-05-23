import { screen } from '@testing-library/react';
import type {
  Api,
  CastVoteRecordFileMetadata,
  CastVoteRecordFileRecord,
  CvrFileMode,
  MachineConfig,
  WriteInAdjudicationStatus,
  WriteInCandidateRecord,
  WriteInDetailView,
  WriteInRecord,
  WriteInSummaryEntry,
  WriteInSummaryEntryAdjudicated,
} from '@votingworks/admin-backend';
import { collections, ok } from '@votingworks/basics';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import {
  CastVoteRecord,
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth,
  ElectionDefinition,
  FullElectionManualTally,
  Id,
  ManualTally,
  Rect,
  SystemSettings,
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

    expectGetCastVoteRecords(castVoteRecords: CastVoteRecord[]) {
      apiClient.getCastVoteRecords.expectCallWith().resolves(castVoteRecords);
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

    expectGetWriteInSummary(
      writeInSummaryRecords: WriteInSummaryEntry[],
      status?: WriteInAdjudicationStatus
    ) {
      if (status) {
        apiClient.getWriteInSummary
          .expectCallWith({
            status,
          })
          .resolves(writeInSummaryRecords);
      } else {
        apiClient.getWriteInSummary
          .expectCallWith()
          .resolves(writeInSummaryRecords);
      }
    },

    expectGetWriteInSummaryAdjudicated(
      writeInSummaryRecords: WriteInSummaryEntryAdjudicated[]
    ) {
      apiClient.getWriteInSummary
        .expectCallWith({
          status: 'adjudicated',
        })
        .resolves(writeInSummaryRecords);
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

    expectDeleteAllManualTallies() {
      apiClient.deleteAllManualTallies.expectCallWith().resolves();
    },

    expectSetManualTally(input: { precinctId: Id; manualTally: ManualTally }) {
      apiClient.setManualTally.expectCallWith(input).resolves();
    },

    expectGetFullElectionManualTally(
      fullElectionManualTally?: FullElectionManualTally
    ) {
      apiClient.getFullElectionManualTally.expectCallWith().resolves(
        fullElectionManualTally
          ? {
              ...fullElectionManualTally,
              resultsByCategory: collections.reduce(
                fullElectionManualTally.resultsByCategory,
                (dictionary, indexedTallies, indexKey) => {
                  return {
                    ...dictionary,
                    [indexKey]: indexedTallies,
                  };
                },
                {}
              ),
            }
          : null
      );
    },

    expectWriteBallotPackageSignatureFile(ballotPackagePath: string) {
      apiClient.writeBallotPackageSignatureFile
        .expectCallWith({ ballotPackagePath })
        .resolves();
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;
