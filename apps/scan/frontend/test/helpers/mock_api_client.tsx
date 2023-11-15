import React from 'react';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  InsertedSmartCardAuth,
  PollsState,
  PollsTransitionType,
  PrecinctSelection,
  Tabulation,
} from '@votingworks/types';
import { MockClient, createMockClient } from '@votingworks/grout-test-utils';
import type {
  Api,
  MachineConfig,
  PollsTransition,
  PrecinctScannerConfig,
  PrecinctScannerPollsInfo,
  PrecinctScannerStatus,
} from '@votingworks/scan-backend';
import { QueryClientProvider } from '@tanstack/react-query';
import { ok, throwIllegalValue } from '@votingworks/basics';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { TestErrorBoundary } from '@votingworks/ui';
import { ApiClientContext, createQueryClient } from '../../src/api';
import { mockUsbDriveStatus } from './mock_usb_drive';

export const machineConfig: MachineConfig = {
  machineId: '0002',
  codeVersion: '3.14',
};

const defaultConfig: PrecinctScannerConfig = {
  isSoundMuted: false,
  isUltrasonicDisabled: false,
  isTestMode: true,
  ballotCountWhenBallotBagLastReplaced: 0,
  electionDefinition: electionGeneralDefinition,
  precinctSelection: ALL_PRECINCTS_SELECTION,
  systemSettings: DEFAULT_SYSTEM_SETTINGS,
};

export const statusNoPaper: PrecinctScannerStatus = {
  state: 'no_paper',
  ballotsCounted: 0,
};

/**
 * Because you can get to the opened state by either opening polls or resuming
 * voting, we don't know exactly what the last transition was. But we want to
 * interpolate our best guess for testing ease.
 */
function getLikelyLastPollsTransitionType(
  pollsState: Exclude<PollsState, 'polls_closed_initial'>
): PollsTransitionType {
  switch (pollsState) {
    case 'polls_closed_final':
      return 'close_polls';
    case 'polls_open':
      return 'open_polls';
    case 'polls_paused':
      return 'pause_voting';
    // istanbul ignore next
    default:
      throwIllegalValue(pollsState);
  }
}

export function mockPollsInfo(
  pollsState: PollsState,
  lastPollsTransition?: Partial<PollsTransition>
): PrecinctScannerPollsInfo {
  if (pollsState === 'polls_closed_initial') {
    return {
      pollsState,
    };
  }
  return {
    pollsState,
    lastPollsTransition: {
      ...(lastPollsTransition ?? {}),
      type: getLikelyLastPollsTransitionType(pollsState),
      time: Date.now(),
      ballotCount: 0,
    },
  };
}

type MockApiClient = Omit<MockClient<Api>, 'transitionPolls'> & {
  // Because transitionPolls takes a timestamp as an argument, which is difficult to mock
  // precisely even with fake timers, we use a jest mock for more flexible matching
  transitionPolls: jest.Mock;
};

function createMockApiClient(): MockApiClient {
  const mockApiClient = createMockClient<Api>();
  // For some reason, using an object spread to override methods breaks the rest
  // of the mockApiClient, so we override like this instead
  (mockApiClient.transitionPolls as unknown as jest.Mock) = jest.fn(() => {
    throw new Error('transitionPolls not mocked');
  });
  return mockApiClient as unknown as MockApiClient;
}

/**
 * Creates a VxScan specific wrapper around commonly used methods from the Grout
 * mock API client to make it easier to use for our specific test needs
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createApiMock() {
  const mockApiClient = createMockApiClient();

  function setAuthStatus(authStatus: InsertedSmartCardAuth.AuthStatus): void {
    mockApiClient.getAuthStatus.expectRepeatedCallsWith().resolves(authStatus);
  }

  return {
    mockApiClient,

    setAuthStatus,

    authenticateAsSystemAdministrator() {
      setAuthStatus({
        status: 'logged_in',
        user: fakeSystemAdministratorUser(),
        sessionExpiresAt: fakeSessionExpiresAt(),
      });
    },

    authenticateAsElectionManager(electionDefinition: ElectionDefinition) {
      setAuthStatus({
        status: 'logged_in',
        user: fakeElectionManagerUser({
          electionHash: electionDefinition.electionHash,
        }),
        sessionExpiresAt: fakeSessionExpiresAt(),
      });
    },

    authenticateAsPollWorker(electionDefinition: ElectionDefinition) {
      setAuthStatus({
        status: 'logged_in',
        user: fakePollWorkerUser({
          electionHash: electionDefinition.electionHash,
        }),
        sessionExpiresAt: fakeSessionExpiresAt(),
      });
    },

    removeCard() {
      setAuthStatus({
        status: 'logged_out',
        reason: 'no_card',
      });
    },

    expectGetUsbDriveStatus(
      status: UsbDriveStatus['status'],
      options: { doesUsbDriveRequireCastVoteRecordSync?: true } = {}
    ): void {
      mockApiClient.getUsbDriveStatus
        .expectRepeatedCallsWith()
        .resolves(mockUsbDriveStatus(status, options));
    },

    expectGetMachineConfig(): void {
      mockApiClient.getMachineConfig.expectCallWith().resolves(machineConfig);
    },

    expectGetConfig(config: Partial<PrecinctScannerConfig> = {}): void {
      mockApiClient.getConfig.expectCallWith().resolves({
        ...defaultConfig,
        ...config,
      });
    },

    expectGetPollsInfo(
      pollsState?: PollsState,
      lastPollsTransition?: Partial<PollsTransition>
    ): void {
      mockApiClient.getPollsInfo
        .expectCallWith()
        .resolves(
          mockPollsInfo(
            pollsState ?? 'polls_closed_initial',
            lastPollsTransition
          )
        );
    },

    expectSetPrecinct(precinctSelection: PrecinctSelection): void {
      mockApiClient.setPrecinctSelection
        .expectCallWith({ precinctSelection })
        .resolves();
    },

    expectSetTestMode(isTestMode: boolean): void {
      mockApiClient.setTestMode.expectCallWith({ isTestMode }).resolves();
    },

    expectGetScannerStatus(status: PrecinctScannerStatus): void {
      mockApiClient.getScannerStatus.expectRepeatedCallsWith().resolves(status);
    },

    expectTransitionPolls(expectedTransitionType: PollsTransitionType): void {
      mockApiClient.transitionPolls.mockImplementationOnce(
        (transition: Omit<PollsTransition, 'ballotCount'>) => {
          if (transition.type !== expectedTransitionType) {
            throw new Error(
              `Unexpected polls transition. Expected ${expectedTransitionType}, got ${transition.type}`
            );
          }
        }
      );
    },

    expectGetScannerResultsByParty(
      results: Tabulation.GroupList<Tabulation.ElectionResults>
    ): void {
      mockApiClient.getScannerResultsByParty.expectCallWith().resolves(results);
    },

    expectExportCastVoteRecordsToUsbDrive(input: {
      mode: 'full_export' | 'polls_closing';
    }): void {
      mockApiClient.exportCastVoteRecordsToUsbDrive
        .expectCallWith(input)
        .resolves(ok());
    },

    expectCheckUltrasonicSupported(supportsUltrasonic: boolean): void {
      mockApiClient.supportsUltrasonic
        .expectCallWith()
        .resolves(supportsUltrasonic);
    },

    expectLogOut() {
      mockApiClient.logOut.expectCallWith().resolves();
    },

    expectGenerateLiveCheckQrCodeValue() {
      mockApiClient.generateLiveCheckQrCodeValue.expectCallWith().resolves({
        qrCodeValue: 'qrCodeValue',
        signatureInputs: {
          machineId: 'machineId',
          date: new Date(),
          electionHashPrefix: 'electionHashPrefix',
        },
      });
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
