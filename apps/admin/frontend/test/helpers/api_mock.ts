import { screen } from '@testing-library/react';
import type { Api } from '@votingworks/admin-backend'; // eslint-disable-line vx/gts-no-import-export-type
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

export type MockApiClient = Omit<MockClient<Api>, 'getAuthStatus'> & {
  // Because this is polled so frequently, we opt for a standard jest mock instead of a
  // libs/test-utils mock since the latter requires every call to be explicitly mocked
  getAuthStatus: jest.Mock;
};

export function createMockApiClient(): MockApiClient {
  const mockApiClient = createMockClient<Api>();
  // For some reason, using an object spread to override the getAuthStatus method breaks the rest
  // of the mockApiClient, so we override like this instead
  (mockApiClient.getAuthStatus as unknown as jest.Mock) = jest.fn(() =>
    Promise.resolve({ status: 'logged_out', reason: 'machine_locked' })
  );
  return mockApiClient as unknown as MockApiClient;
}

export function setAuthStatus(
  mockApiClient: MockApiClient,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  mockApiClient.getAuthStatus.mockImplementation(() =>
    Promise.resolve(authStatus)
  );
}

export function expectGetCurrentElectionMetadata(
  mockApiClient: MockApiClient,
  metadata: {
    electionDefinition: ElectionDefinition;
    isOfficialResults?: boolean;
    id?: string;
    createdAt?: string;
  } | null,
  times = 1
): void {
  for (let i = 0; i < times; i += 1) {
    mockApiClient.getCurrentElectionMetadata.expectCallWith().resolves(
      metadata
        ? {
            id: 'election-id',
            createdAt: new Date().toISOString(),
            isOfficialResults: false,
            ...metadata,
          }
        : null
    );
  }
}

export function expectGetCastVoteRecords(
  mockApiClient: MockApiClient,
  castVoteRecords: CastVoteRecord[] = [],
  times = 1
): void {
  for (let i = 0; i < (times ?? 0); i += 1) {
    mockApiClient.getCastVoteRecords.expectCallWith().resolves(castVoteRecords);
  }
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

    setAuthStatus(authStatus: DippedSmartCardAuth.AuthStatus) {
      apiClient.getAuthStatus.mockImplementation(() =>
        Promise.resolve(authStatus)
      );
    },

    async authenticateAsSystemAdministrator() {
      // first verify that we're logged out
      await screen.findByText('VxAdmin is Locked');
      setAuthStatus(apiClient, {
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

      setAuthStatus(apiClient, {
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

    expectGetCurrentElectionMetadata(
      metadata: {
        electionDefinition: ElectionDefinition;
        isOfficialResults?: boolean;
        id?: string;
        createdAt?: string;
      } | null,
      times = 1
    ) {
      for (let i = 0; i < times; i += 1) {
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
      }
    },

    expectGetCastVoteRecords(castVoteRecords: CastVoteRecord[], times = 1) {
      for (let i = 0; i < (times ?? 0); i += 1) {
        apiClient.getCastVoteRecords.expectCallWith().resolves(castVoteRecords);
      }
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

    expectMarkResultsOfficial() {
      apiClient.markResultsOfficial.expectCallWith().resolves();
    },

    expectClearCastVoteRecordFiles() {
      apiClient.clearCastVoteRecordFiles.expectCallWith().resolves();
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;
