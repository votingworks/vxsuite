import React from 'react';
import { Buffer } from 'buffer';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import type { Api, MachineConfig } from '@votingworks/mark-scan-backend';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  AllPrecinctsSelection,
  BallotPackageConfigurationError,
  BallotStyleId,
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  ElectionDefinition,
  InsertedSmartCardAuth,
  InterpretedBmdPage,
  PrecinctId,
  PrecinctSelection,
  SystemSettings,
} from '@votingworks/types';
import {
  fakeCardlessVoterUser,
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import { assert, err, ok, Result } from '@votingworks/basics';
import { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { TestErrorBoundary } from '@votingworks/ui';
import { ApiClientContext, createQueryClient } from '../../src/api';
import { fakeMachineConfig } from './fake_machine_config';

interface CardlessVoterUserParams {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
}

type MockApiClient = Omit<MockClient<Api>, 'getAuthStatus'> & {
  // Because these are polled so frequently, we opt for a standard jest mock instead of a
  // libs/test-utils mock since the latter requires every call to be explicitly mocked
  getAuthStatus: jest.Mock;
  getPaperHandlerState: jest.Mock;
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
        cardlessVoterUserParams?: CardlessVoterUserParams;
      } = {}
    ) {
      const { electionHash } = electionDefinition;
      const { cardlessVoterUserParams } = options;

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

    // Sets auth status to cardless voter logged in with the first precinct and ballot style on the election definition parameter.
    setAuthStatusCardlessVoterLoggedInWithDefaults(
      electionDefinition: ElectionDefinition
    ) {
      this.setAuthStatusCardlessVoterLoggedIn({
        ballotStyleId: electionDefinition.election.ballotStyles[0].id,
        precinctId: electionDefinition.election.precincts[0].id,
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

    /**
     * Expects a call to getPrecinctSelection. The call will resolve with the first precinct of the given election.
     * @param election The election to reference when choosing the precinct with which getPrecinctSelection() will resolve.
     */
    expectGetPrecinctSelectionResolvesDefault(election: Election) {
      assert(
        election?.precincts[0] !== undefined,
        'Could not mock getPrecinctSelection because the provided election has no precincts'
      );
      mockApiClient.getPrecinctSelection
        .expectCallWith()
        .resolves(singlePrecinctSelectionFor(election.precincts[0].id));
    },

    expectGetPrecinctSelection(precinctSelection?: PrecinctSelection) {
      mockApiClient.getPrecinctSelection
        .expectCallWith()
        .resolves(precinctSelection);
    },

    expectSetPrecinctSelection(
      precinctSelection: PrecinctSelection | AllPrecinctsSelection
    ) {
      mockApiClient.setPrecinctSelection
        .expectCallWith({ precinctSelection })
        .resolves();
    },

    expectSetPrecinctSelectionRepeated(
      precinctSelection: PrecinctSelection | AllPrecinctsSelection
    ) {
      mockApiClient.setPrecinctSelection
        .expectRepeatedCallsWith({ precinctSelection })
        .resolves();
    },

    expectGetSystemSettings(
      systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
    ) {
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

    expectPrintBallot(pdfData = Buffer.of()): void {
      mockApiClient.printBallot.expectCallWith({ pdfData }).resolves();
    },

    expectGetInterpretation(
      interpretation: InterpretedBmdPage | null = null
    ): void {
      mockApiClient.getInterpretation.expectCallWith().resolves(interpretation);
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

    // Some e2e tests repeatedly reset voter session. Each time a voter session is activated
    // setAcceptingPaperState is called.
    expectRepeatedSetAcceptingPaperState(): void {
      mockApiClient.setAcceptingPaperState.expectRepeatedCallsWith().resolves();
      setPaperHandlerState('accepting_paper');
    },

    // Mocked version of a real method on the API client
    expectSetAcceptingPaperState(): void {
      mockApiClient.setAcceptingPaperState.expectCallWith().resolves();
      setPaperHandlerState('accepting_paper');
    },

    // Helper on the mock API client; does not exist on real API client
    setPaperHandlerState,

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

    expectEndCardlessVoterSession() {
      mockApiClient.endCardlessVoterSession.expectCallWith().resolves();
    },

    expectLogOut() {
      mockApiClient.logOut.expectCallWith().resolves();
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
      <ApiClientContext.Provider value={apiMock.mockApiClient}>
        <QueryClientProvider client={createQueryClient()}>
          {children}
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </TestErrorBoundary>
  );
}
