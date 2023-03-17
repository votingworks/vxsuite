import { screen } from '@testing-library/react';
import {
  Api,
  CastVoteRecordFileMetadata,
  MachineConfig,
} from '@votingworks/admin-backend';
import { Admin } from '@votingworks/api';
import { ok } from '@votingworks/basics';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import {
  fakeElectionManagerUser,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import {
  CastVoteRecord,
  DippedSmartCardAuth,
  ElectionDefinition,
} from '@votingworks/types';

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
      userRole: 'system_administrator' | 'election_manager' | 'poll_worker'
    ) {
      apiClient.programCard
        .expectCallWith({ userRole })
        .resolves(ok({ pin: '123456' }));
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

    expectGetCastVoteRecordFileMode(fileMode: Admin.CvrFileMode) {
      apiClient.getCastVoteRecordFileMode.expectCallWith().resolves(fileMode);
    },

    expectGetCastVoteRecordFiles(
      fileRecords: Admin.CastVoteRecordFileRecord[]
    ) {
      apiClient.getCastVoteRecordFiles.expectCallWith().resolves(fileRecords);
    },

    expectGetOfficialPrintedBallots(
      printedBallotRecords: Admin.PrintedBallotRecord[]
    ) {
      apiClient.getPrintedBallots
        .expectCallWith({ ballotMode: Admin.BallotMode.Official })
        .resolves(printedBallotRecords);
    },

    expectAddPrintedBallot(printedBallot: Admin.PrintedBallot) {
      apiClient.addPrintedBallots
        .expectCallWith({
          printedBallot,
        })
        .resolves('id');
    },

    expectGetWriteInSummaryAdjudicated(
      writeInSummaryRecords: Admin.WriteInSummaryEntryAdjudicated[]
    ) {
      apiClient.getWriteInSummary
        .expectCallWith({
          status: 'adjudicated',
        })
        .resolves(writeInSummaryRecords);
    },

    expectGetWriteIns(writeInRecords: Admin.WriteInRecord[]) {
      apiClient.getWriteIns.expectCallWith().resolves(writeInRecords);
    },

    expectGetWriteInImage(writeInId: string) {
      apiClient.getWriteInImage.expectCallWith({ writeInId }).resolves([]);
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
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;
