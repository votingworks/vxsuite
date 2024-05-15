import React from 'react';

import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import type {
  Api,
  MachineConfig,
  ElectionState,
  PrintBallotProps,
} from '@votingworks/mark-backend';
import {
  ElectionPackageConfigurationError,
  BallotStyleId,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  InsertedSmartCardAuth,
  PollsState,
  PrecinctId,
  PrecinctSelection,
  SystemSettings,
} from '@votingworks/types';
import {
  mockCardlessVoterUser,
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { err, ok, Result } from '@votingworks/basics';
import { TestErrorBoundary } from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockMachineConfig } from './mock_machine_config';
import { initialElectionState } from '../../src/app_root';
import { ApiProvider } from '../../src/api_provider';

interface CardlessVoterUserParams {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
}

type MockApiClient = Omit<
  MockClient<Api>,
  'getAuthStatus' | 'getUsbDriveStatus'
> & {
  // Because this is polled so frequently, we opt for a standard jest mock instead of a
  // libs/test-utils mock since the latter requires every call to be explicitly mocked
  getAuthStatus: jest.Mock;
  getUsbDriveStatus: jest.Mock;
};

function createMockApiClient(): MockApiClient {
  const mockApiClient = createMockClient<Api>();
  // For some reason, using an object spread to override the polling methods breaks the rest
  // of the mockApiClient, so we override like this instead
  (mockApiClient.getAuthStatus as unknown as jest.Mock) = jest.fn(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
  (mockApiClient.getUsbDriveStatus as unknown as jest.Mock) = jest.fn(() =>
    Promise.resolve({ status: 'no_drive' })
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

  function setUsbDriveStatus(usbDriveStatus: UsbDriveStatus): void {
    mockApiClient.getUsbDriveStatus.mockImplementation(() =>
      Promise.resolve(usbDriveStatus)
    );
  }

  const electionStateRef: { current: ElectionState } = {
    current: initialElectionState,
  };

  return {
    mockApiClient,

    setUsbDriveStatus,

    setAuthStatus,

    setAuthStatusSystemAdministratorLoggedIn() {
      setAuthStatus({
        status: 'logged_in',
        user: mockSystemAdministratorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
    },

    setAuthStatusElectionManagerLoggedIn(
      electionDefinition: ElectionDefinition
    ) {
      setAuthStatus({
        status: 'logged_in',
        user: mockElectionManagerUser({
          electionHash: electionDefinition.electionHash,
        }),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
    },

    setAuthStatusPollWorkerLoggedIn(
      electionDefinition: ElectionDefinition,
      options: {
        cardlessVoterUserParams?: CardlessVoterUserParams;
      } = {}
    ) {
      const { electionHash } = electionDefinition;
      const { cardlessVoterUserParams } = options;

      setAuthStatus({
        status: 'logged_in',
        user: mockPollWorkerUser({ electionHash }),
        sessionExpiresAt: mockSessionExpiresAt(),
        cardlessVoterUser: cardlessVoterUserParams
          ? mockCardlessVoterUser(cardlessVoterUserParams)
          : undefined,
      });
    },

    setAuthStatusCardlessVoterLoggedIn(
      cardlessVoterUserParams: CardlessVoterUserParams
    ) {
      setAuthStatus({
        status: 'logged_in',
        user: mockCardlessVoterUser(cardlessVoterUserParams),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
    },

    setAuthStatusLoggedOut(
      reason: InsertedSmartCardAuth.LoggedOut['reason'] = 'no_card'
    ) {
      setAuthStatus({
        status: 'logged_out',
        reason,
      });
    },

    expectGetElectionDefinition(electionDefinition: ElectionDefinition | null) {
      mockApiClient.getElectionDefinition
        .expectCallWith()
        .resolves(electionDefinition);
    },

    expectGetSystemSettings(
      systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
    ) {
      mockApiClient.getSystemSettings.expectCallWith().resolves(systemSettings);
    },

    expectGetMachineConfig(props: Partial<MachineConfig> = {}): void {
      mockApiClient.getMachineConfig
        .expectCallWith()
        .resolves(mockMachineConfig(props));
    },

    expectGetMachineConfigToError(): void {
      mockApiClient.getMachineConfig.expectCallWith().throws('unexpected_err');
    },

    expectUnconfigureMachine(): void {
      mockApiClient.unconfigureMachine.expectCallWith().resolves();
    },

    expectConfigureElectionPackageFromUsb(
      electionDefinition: ElectionDefinition
    ): void {
      const result: Result<
        ElectionDefinition,
        ElectionPackageConfigurationError
      > = ok(electionDefinition);
      mockApiClient.configureElectionPackageFromUsb
        .expectCallWith()
        .resolves(result);
    },

    expectConfigureElectionPackageFromUsbError(
      error: ElectionPackageConfigurationError
    ): void {
      const result: Result<
        ElectionDefinition,
        ElectionPackageConfigurationError
      > = err(error);
      mockApiClient.configureElectionPackageFromUsb
        .expectCallWith()
        .resolves(result);
    },

    expectLogOut() {
      mockApiClient.logOut.expectCallWith().resolves();
    },

    expectEjectUsbDrive() {
      mockApiClient.ejectUsbDrive.expectCallWith().resolves();
    },

    expectGetElectionState(electionState?: Partial<ElectionState>) {
      electionStateRef.current = electionState
        ? {
            ...electionStateRef.current,
            ...electionState,
          }
        : initialElectionState;
      mockApiClient.getElectionState
        .expectCallWith()
        .resolves(electionStateRef.current);
    },

    expectSetPollsState(pollsState: PollsState) {
      mockApiClient.setPollsState.expectCallWith({ pollsState }).resolves();
    },

    expectSetTestMode(isTestMode: boolean) {
      mockApiClient.setTestMode.expectCallWith({ isTestMode }).resolves();
    },

    expectSetPrecinctSelection(precinctSelection: PrecinctSelection) {
      mockApiClient.setPrecinctSelection
        .expectCallWith({ precinctSelection })
        .resolves();
    },

    expectPrintBallot(input: PrintBallotProps) {
      mockApiClient.printBallot.expectCallWith(input).resolves();
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
