import React from 'react';

import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { Api, MachineConfig } from '@votingworks/mark-backend';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  BallotPackageConfigurationError,
  BallotStyleId,
  ElectionDefinition,
  InsertedSmartCardAuth,
  PrecinctId,
  SystemSettings,
} from '@votingworks/types';
import {
  fakeCardlessVoterUser,
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import { err, ok, Optional, Result } from '@votingworks/basics';
import { ScannerReportData } from '@votingworks/utils';
import { ApiClientContext, createQueryClient } from '../../src/api';
import { fakeMachineConfig } from './fake_machine_config';

interface CardlessVoterUserParams {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
}

type MockApiClient = Omit<MockClient<Api>, 'getAuthStatus'> & {
  // Because this is polled so frequently, we opt for a standard jest mock instead of a
  // libs/test-utils mock since the latter requires every call to be explicitly mocked
  getAuthStatus: jest.Mock;
};

function createMockApiClient(): MockApiClient {
  const mockApiClient = createMockClient<Api>();
  // For some reason, using an object spread to override the getAuthStatus method breaks the rest
  // of the mockApiClient, so we override like this instead
  (mockApiClient.getAuthStatus as unknown as jest.Mock) = jest.fn(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
  return mockApiClient as unknown as MockApiClient;
}

/**
 * Creates a VxMark specific wrapper around commonly used methods from the Grout
 * mock API client to make it easier to use for our specific test needs
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createApiMock() {
  const mockApiClient = createMockApiClient();

  function setAuthStatus(authStatus: InsertedSmartCardAuth.AuthStatus): void {
    mockApiClient.getAuthStatus.mockImplementation(() =>
      Promise.resolve(authStatus)
    );
  }

  return {
    mockApiClient,

    setAuthStatus,

    setAuthStatusSystemAdministratorLoggedIn() {
      setAuthStatus({
        status: 'logged_in',
        user: fakeSystemAdministratorUser(),
        sessionExpiresAt: fakeSessionExpiresAt(),
      });
    },

    setAuthStatusElectionManagerLoggedIn(
      electionDefinition: ElectionDefinition
    ) {
      setAuthStatus({
        status: 'logged_in',
        user: fakeElectionManagerUser({
          electionHash: electionDefinition.electionHash,
        }),
        sessionExpiresAt: fakeSessionExpiresAt(),
      });
    },

    setAuthStatusPollWorkerLoggedIn(
      electionDefinition: ElectionDefinition,
      options: {
        isScannerReportDataReadExpected?: boolean;
        scannerReportDataReadResult?: Result<
          Optional<ScannerReportData>,
          Error
        >;
        cardlessVoterUserParams?: CardlessVoterUserParams;
      } = {}
    ) {
      const { electionHash } = electionDefinition;
      const {
        isScannerReportDataReadExpected = true,
        scannerReportDataReadResult = ok(undefined),
        cardlessVoterUserParams,
      } = options;

      if (isScannerReportDataReadExpected) {
        mockApiClient.readScannerReportDataFromCard
          .expectCallWith({ electionHash })
          .resolves(scannerReportDataReadResult);
      }

      setAuthStatus({
        status: 'logged_in',
        user: fakePollWorkerUser({ electionHash }),
        sessionExpiresAt: fakeSessionExpiresAt(),
        cardlessVoterUser: cardlessVoterUserParams
          ? fakeCardlessVoterUser(cardlessVoterUserParams)
          : undefined,
      });
    },

    setAuthStatusCardlessVoterLoggedIn(
      cardlessVoterUserParams: CardlessVoterUserParams
    ) {
      setAuthStatus({
        status: 'logged_in',
        user: fakeCardlessVoterUser(cardlessVoterUserParams),
        sessionExpiresAt: fakeSessionExpiresAt(),
      });
    },

    setAuthStatusLoggedOut() {
      setAuthStatus({
        status: 'logged_out',
        reason: 'no_card',
      });
    },

    expectGetElectionDefinition(electionDefinition: ElectionDefinition | null) {
      mockApiClient.getElectionDefinition
        .expectCallWith()
        .resolves(electionDefinition);
    },

    expectGetSystemSettings(systemSettings: SystemSettings | null) {
      mockApiClient.getSystemSettings.expectCallWith().resolves(systemSettings);
    },

    expectGetMachineConfig(props: Partial<MachineConfig> = {}): void {
      mockApiClient.getMachineConfig
        .expectCallWith()
        .resolves(fakeMachineConfig(props));
    },

    expectGetMachineConfigToError(): void {
      mockApiClient.getMachineConfig.expectCallWith().throws('unexpected_err');
    },

    expectUnconfigureMachine(): void {
      mockApiClient.unconfigureMachine.expectCallWith().resolves();
    },

    expectConfigureBallotPackageFromUsb(
      electionDefinition: ElectionDefinition
    ): void {
      const result: Result<
        ElectionDefinition,
        BallotPackageConfigurationError
      > = ok(electionDefinition);
      mockApiClient.configureBallotPackageFromUsb
        .expectCallWith()
        .resolves(result);
    },

    expectConfigureBallotPackageFromUsbError(
      error: BallotPackageConfigurationError
    ): void {
      const result: Result<
        ElectionDefinition,
        BallotPackageConfigurationError
      > = err(error);
      mockApiClient.configureBallotPackageFromUsb
        .expectCallWith()
        .resolves(result);
    },
  };
}

export type ApiMock = ReturnType<typeof createApiMock>;

export function provideApi(
  apiMock: ReturnType<typeof createApiMock>,
  children: React.ReactNode
): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        {children}
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}
