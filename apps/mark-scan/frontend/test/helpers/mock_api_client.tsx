import React from 'react';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import type {
  Api,
  ElectionState,
  MachineConfig,
  PrintBallotProps,
  SimpleServerStatus,
} from '@votingworks/mark-scan-backend';
import {
  ElectionPackageConfigurationError,
  BallotStyleId,
  DEFAULT_SYSTEM_SETTINGS,
  DiagnosticRecord,
  ElectionDefinition,
  InsertedSmartCardAuth,
  InterpretedBmdPage,
  PollsState,
  PrecinctId,
  PrecinctSelection,
  SystemSettings,
  DiagnosticType,
  electionAuthKey,
} from '@votingworks/types';
import {
  mockCardlessVoterUser,
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { err, ok, Result } from '@votingworks/basics';
import type { BatteryInfo, DiskSpaceSummary } from '@votingworks/backend';
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
  | 'getAuthStatus'
  | 'getPaperHandlerState'
  | 'getUsbDriveStatus'
  | 'getBatteryInfo'
  | 'isPatDeviceConnected'
> & {
  // Because these are polled so frequently, we opt for a standard jest mock instead of a
  // libs/test-utils mock since the latter requires every call to be explicitly mocked
  getAuthStatus: jest.Mock;
  getPaperHandlerState: jest.Mock;
  getUsbDriveStatus: jest.Mock;
  getBatteryInfo: jest.Mock;
  getIsPatDeviceConnected: jest.Mock;
};

function createMockApiClient(): MockApiClient {
  const mockApiClient = createMockClient<Api>();
  // For some reason, using an object spread to override the getAuthStatus method breaks the rest
  // of the mockApiClient, so we override like this instead
  (mockApiClient.getAuthStatus as unknown as jest.Mock) = jest.fn(() =>
    Promise.resolve({ status: 'logged_out', reason: 'no_card' })
  );
  (mockApiClient.getPaperHandlerState as unknown as jest.Mock) = jest.fn(() =>
    Promise.resolve('not_accepting_paper')
  );
  (mockApiClient.getUsbDriveStatus as unknown as jest.Mock) = jest.fn(() =>
    Promise.resolve({ status: 'no_drive' })
  );
  (mockApiClient.getBatteryInfo as unknown as jest.Mock) = jest.fn(() =>
    Promise.resolve(null)
  );
  (mockApiClient.getIsPatDeviceConnected as unknown as jest.Mock) = jest.fn(
    () => Promise.resolve(false)
  );

  return mockApiClient as unknown as MockApiClient;
}

/**
 * Creates a VxMarkScan specific wrapper around commonly used methods from the Grout
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

  function setPaperHandlerState(state: SimpleServerStatus): void {
    mockApiClient.getPaperHandlerState.mockImplementation(() =>
      Promise.resolve(state)
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
          electionKey: electionAuthKey(electionDefinition.election),
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
      const { cardlessVoterUserParams } = options;

      setAuthStatus({
        status: 'logged_in',
        user: mockPollWorkerUser({
          electionKey: electionAuthKey(electionDefinition.election),
        }),
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

    // Sets auth status to cardless voter logged in with the first precinct and ballot style on the election definition parameter.
    setAuthStatusCardlessVoterLoggedInWithDefaults(
      electionDefinition: ElectionDefinition
    ) {
      this.setAuthStatusCardlessVoterLoggedIn({
        ballotStyleId: electionDefinition.election.ballotStyles[0].id,
        precinctId: electionDefinition.election.precincts[0].id,
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

    setBatteryInfo(batteryInfo?: BatteryInfo): void {
      mockApiClient.getBatteryInfo.mockResolvedValue(batteryInfo ?? null);
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

    expectPrintBallot(props: PrintBallotProps): void {
      mockApiClient.printBallot.expectCallWith(props).resolves();
    },

    expectGetInterpretation(
      interpretation: InterpretedBmdPage | null = null
    ): void {
      mockApiClient.getInterpretation.expectCallWith().resolves(interpretation);
    },

    expectConfirmSessionEnd(): void {
      mockApiClient.confirmSessionEnd.expectCallWith().resolves();
    },

    expectValidateBallot(): void {
      mockApiClient.validateBallot.expectCallWith().resolves();
    },

    expectInvalidateBallot(): void {
      mockApiClient.invalidateBallot.expectCallWith().resolves();
    },

    expectConfirmInvalidateBallot(): void {
      mockApiClient.confirmInvalidateBallot.expectCallWith().resolves();
    },

    expectConfirmBallotBoxEmptied(): void {
      mockApiClient.confirmBallotBoxEmptied.expectCallWith().resolves();
    },

    // Some e2e tests repeatedly reset voter session. Each time a voter session is activated
    // setAcceptingPaperState is called.
    expectRepeatedSetAcceptingPaperState(): void {
      mockApiClient.setAcceptingPaperState.expectRepeatedCallsWith().resolves();
      setPaperHandlerState('accepting_paper');
    },

    // Mocked version of a real method on the API client
    expectSetAcceptingPaperState(): void {
      mockApiClient.setAcceptingPaperState.expectCallWith().resolves();
    },

    // Helper on the mock API client; does not exist on real API client
    setPaperHandlerState,

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

    expectEndCardlessVoterSession() {
      mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
    },

    expectLogOut() {
      mockApiClient.logOut.expectCallWith().resolves();
    },

    expectEjectUsbDrive() {
      mockApiClient.ejectUsbDrive.expectCallWith().resolves();
    },

    expectSetPatDeviceIsCalibrated() {
      mockApiClient.setPatDeviceIsCalibrated.expectCallWith().resolves();
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

    expectStartPaperHandlerDiagnostic() {
      mockApiClient.startPaperHandlerDiagnostic.expectCallWith().resolves();
    },

    expectSetPrecinctSelection(precinctSelection: PrecinctSelection) {
      mockApiClient.setPrecinctSelection
        .expectCallWith({ precinctSelection })
        .resolves();
    },

    expectGetIsAccessibleControllerInputDetected(detected: boolean = true) {
      mockApiClient.getIsAccessibleControllerInputDetected
        .expectRepeatedCallsWith()
        .resolves(detected);
    },

    setIsPatDeviceConnected(connected: boolean): void {
      mockApiClient.getIsPatDeviceConnected.mockResolvedValue(connected);
    },

    expectAddDiagnosticRecord(record: Omit<DiagnosticRecord, 'timestamp'>) {
      mockApiClient.addDiagnosticRecord.expectCallWith(record).resolves();
    },

    expectGetMostRecentDiagnostic(
      diagnosticType: DiagnosticType,
      record?: DiagnosticRecord
    ) {
      mockApiClient.getMostRecentDiagnostic
        .expectCallWith({ diagnosticType })
        .resolves(record ?? null);
    },

    expectGetApplicationDiskSpaceSummary(summary?: DiskSpaceSummary) {
      mockApiClient.getApplicationDiskSpaceSummary.expectCallWith().resolves(
        summary ?? {
          available: 1_000_000_000,
          used: 1_000_000_000,
          total: 2_000_000_000,
        }
      );
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
