import { assert } from '@votingworks/basics';
import waitForExpect from 'wait-for-expect';
import {
  electionFamousNames2021Fixtures,
  systemSettings,
  electionTwoPartyPrimaryFixtures,
  electionGeneralDefinition,
} from '@votingworks/fixtures';
import { mockOf, suppressingConsoleOutput } from '@votingworks/test-utils';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  ALL_PRECINCTS_SELECTION,
  ELECTION_PACKAGE_FOLDER,
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { Server } from 'http';
import * as grout from '@votingworks/grout';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  safeParseSystemSettings,
} from '@votingworks/types';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { PaperHandlerDriver } from '@votingworks/custom-paper-handler';
import { LogEventId, Logger } from '@votingworks/logging';
import { createApp } from '../test/app_helpers';
import { Api } from './app';
import { PaperHandlerStateMachine } from './custom-paper-handler';
import { ElectionState } from './types';
import {
  mockElectionManagerAuth,
  mockPollWorkerAuth,
} from '../test/auth_helpers';
import {
  getDefaultPaperHandlerStatus,
  getPaperInFrontStatus,
} from './custom-paper-handler/test_utils';
import { PatConnectionStatusReader } from './pat-input/connection_status_reader';

jest.mock('@votingworks/custom-paper-handler');
jest.mock('./pat-input/connection_status_reader');

const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

let apiClient: grout.Client<Api>;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsbDrive: MockUsbDrive;
let server: Server;
let stateMachine: PaperHandlerStateMachine;
let driver: PaperHandlerDriver;
let patConnectionStatusReader: PatConnectionStatusReader;
let logger: Logger;

beforeEach(async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  patConnectionStatusReader = new PatConnectionStatusReader(logger);
  mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
    false
  );

  const result = await createApp({ patConnectionStatusReader });
  apiClient = result.apiClient;
  logger = result.logger;
  mockAuth = result.mockAuth;
  mockUsbDrive = result.mockUsbDrive;
  server = result.server;
  stateMachine = result.stateMachine;
  driver = result.driver;
});

afterEach(async () => {
  await stateMachine.cleanUp();
  server?.close();
});

async function setUpUsbAndConfigureElection(
  electionDefinition: ElectionDefinition
) {
  mockElectionManagerAuth(mockAuth, electionDefinition);
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings: safeParseSystemSettings(
        systemSettings.asText()
      ).unsafeUnwrap(),
    })
  );

  const writeResult = await apiClient.configureElectionPackageFromUsb();
  assert(
    writeResult.isOk(),
    `Failed to configure election package from USB with error ${writeResult.err()}`
  );
}

async function configureForTestElection() {
  await setUpUsbAndConfigureElection(electionGeneralDefinition);
  await apiClient.setPrecinctSelection({
    precinctSelection: singlePrecinctSelectionFor(
      electionGeneralDefinition.election.precincts[1].id
    ),
  });
}

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
    VX_SCREEN_ORIENTATION: 'landscape',
  };

  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
    screenOrientation: 'landscape',
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: '0000',
    codeVersion: 'dev',
    screenOrientation: 'portrait',
  });
});

test('configureElectionPackageFromUsb reads to and writes from store', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  mockElectionManagerAuth(mockAuth, electionDefinition);
  await setUpUsbAndConfigureElection(electionDefinition);

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  const electionDefinitionResult = await apiClient.getElectionDefinition();
  expect(electionDefinitionResult).toEqual(electionDefinition);
});

test('unconfigureMachine deletes system settings and election definition', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;

  mockElectionManagerAuth(mockAuth, electionDefinition);
  mockElectionManagerAuth(mockAuth, electionDefinition);
  let readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );

  await setUpUsbAndConfigureElection(electionDefinition);
  await apiClient.unconfigureMachine();

  readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
  const electionDefinitionResult = await apiClient.getElectionDefinition();
  expect(electionDefinitionResult).toBeNull();
});

test('configureElectionPackageFromUsb throws when no USB drive mounted', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  mockElectionManagerAuth(mockAuth, electionDefinition);

  mockUsbDrive.usbDrive.status
    .expectCallWith()
    .resolves({ status: 'no_drive' });
  await suppressingConsoleOutput(async () => {
    await expect(apiClient.configureElectionPackageFromUsb()).rejects.toThrow(
      'No USB drive mounted'
    );
  });
});

test('configureElectionPackageFromUsb returns an error if election package parsing fails', async () => {
  // Lack of auth will cause election package reading to throw
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );

  mockUsbDrive.insertUsbDrive({
    'some-election': {
      [ELECTION_PACKAGE_FOLDER]: {
        'test-election-package.zip': Buffer.from("doesn't matter"),
      },
    },
  });

  const result = await apiClient.configureElectionPackageFromUsb();
  assert(result.isErr());
  expect(result.err()).toEqual('auth_required_before_election_package_load');
});

test('usbDrive', async () => {
  const { usbDrive } = mockUsbDrive;

  usbDrive.status.expectCallWith().resolves({ status: 'no_drive' });
  expect(await apiClient.getUsbDriveStatus()).toEqual({
    status: 'no_drive',
  });

  usbDrive.eject.expectCallWith().resolves();
  await apiClient.ejectUsbDrive();

  mockElectionManagerAuth(
    mockAuth,
    electionFamousNames2021Fixtures.electionDefinition
  );
  usbDrive.eject.expectCallWith().resolves();
  await apiClient.ejectUsbDrive();
});

async function expectElectionState(expected: Partial<ElectionState>) {
  expect(await apiClient.getElectionState()).toMatchObject(expected);
}

test('single precinct election automatically has precinct set on configure', async () => {
  await setUpUsbAndConfigureElection(
    electionTwoPartyPrimaryFixtures.singlePrecinctElectionDefinition
  );

  await expectElectionState({
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
  });
});

test('polls state', async () => {
  await expectElectionState({ pollsState: 'polls_closed_initial' });

  await setUpUsbAndConfigureElection(
    electionFamousNames2021Fixtures.electionDefinition
  );
  await expectElectionState({ pollsState: 'polls_closed_initial' });

  mockPollWorkerAuth(
    mockAuth,
    electionFamousNames2021Fixtures.electionDefinition
  );
  await apiClient.setPollsState({ pollsState: 'polls_open' });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PollsOpened,
    'poll_worker',
    { disposition: 'success' }
  );
  await expectElectionState({ pollsState: 'polls_open' });

  await apiClient.setPollsState({ pollsState: 'polls_paused' });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.VotingPaused,
    'poll_worker',
    { disposition: 'success' }
  );
  await expectElectionState({ pollsState: 'polls_paused' });

  await apiClient.setPollsState({ pollsState: 'polls_open' });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.VotingResumed,
    'poll_worker',
    { disposition: 'success' }
  );
  await expectElectionState({ pollsState: 'polls_open' });

  await apiClient.setPollsState({ pollsState: 'polls_closed_final' });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PollsClosed,
    'poll_worker',
    { disposition: 'success' }
  );
  await expectElectionState({ pollsState: 'polls_closed_final' });

  // system admin resetting polls to paused
  await apiClient.setPollsState({ pollsState: 'polls_paused' });
  await expectElectionState({ pollsState: 'polls_paused' });
});

test('test mode', async () => {
  await expectElectionState({ isTestMode: true });

  await setUpUsbAndConfigureElection(
    electionFamousNames2021Fixtures.electionDefinition
  );

  await apiClient.setTestMode({ isTestMode: false });
  await expectElectionState({ isTestMode: false });

  await apiClient.setTestMode({ isTestMode: true });
  await expectElectionState({ isTestMode: true });
});

test('setting precinct', async () => {
  expect(
    (await apiClient.getElectionState()).precinctSelection
  ).toBeUndefined();

  await setUpUsbAndConfigureElection(
    electionFamousNames2021Fixtures.electionDefinition
  );
  expect(
    (await apiClient.getElectionState()).precinctSelection
  ).toBeUndefined();

  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  await expectElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  const singlePrecinctSelection = singlePrecinctSelectionFor('23');
  await apiClient.setPrecinctSelection({
    precinctSelection: singlePrecinctSelection,
  });
  await expectElectionState({
    precinctSelection: singlePrecinctSelection,
  });
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.PrecinctConfigurationChanged,
    {
      disposition: 'success',
      message: 'User set the precinct for the machine to North Lincoln',
    }
  );
});

test('printing a ballot increments the printed ballot count', async () => {
  await expectElectionState({ ballotsPrintedCount: 0 });

  await setUpUsbAndConfigureElection(
    electionFamousNames2021Fixtures.electionDefinition
  );
  await expectElectionState({ ballotsPrintedCount: 0 });

  await apiClient.printBallot({ pdfData: Buffer.from('pdf data') });
  await expectElectionState({ ballotsPrintedCount: 1 });
});

test('empty ballot box requires poll worker auth', async () => {
  await configureForTestElection();

  await suppressingConsoleOutput(async () => {
    await expect(apiClient.confirmBallotBoxEmptied()).rejects.toThrow(
      'Expected pollworker auth'
    );
  });
});

test('empty ballot box', async () => {
  await configureForTestElection();
  mockPollWorkerAuth(mockAuth, electionGeneralDefinition);

  await apiClient.confirmBallotBoxEmptied();
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.BallotBoxEmptied,
    'poll_worker'
  );
});

test('getPaperHandlerState returns state machine state', async () => {
  await configureForTestElection();
  await apiClient.setAcceptingPaperState();
  expect(await apiClient.getPaperHandlerState()).toEqual('accepting_paper');
});

test('setAcceptingPaperState is a no-op when USE_MOCK_PAPER_HANDLER flag is on', async () => {
  expect(await apiClient.getPaperHandlerState()).toEqual('not_accepting_paper');
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER
  );
  await apiClient.setAcceptingPaperState();
  expect(await apiClient.getPaperHandlerState()).toEqual('not_accepting_paper');
});

test('printBallot sets the interpretation fixture when USE_MOCK_PAPER_HANDLER is on', async () => {
  await configureForTestElection();

  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER
  );
  await apiClient.printBallot({ pdfData: Buffer.of() });
  await waitForExpect(async () => {
    expect(await apiClient.getPaperHandlerState()).toEqual('presenting_ballot');
  });
  const interpretation = await apiClient.getInterpretation();
  assert(interpretation);
  expect(interpretation.type).toEqual('InterpretedBmdPage');
  expect(interpretation.votes['102']).toEqual(['measure-102-option-yes']);
});

test('getInterpretation returns null if no interpretation is stored on the state machine', async () => {
  expect(await apiClient.getInterpretation()).toEqual(null);
});

async function waitForExpectStatus(status: string): Promise<void> {
  await waitForExpect(async () => {
    expect(await apiClient.getPaperHandlerState()).toEqual(status);
  });
}

test('ballot invalidation flow', async () => {
  await configureForTestElection();
  // Skip session start, paper load, etc stages
  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(
    getPaperInFrontStatus()
  );
  stateMachine.setInterpretationFixture();
  await waitForExpectStatus('presenting_ballot');
  await apiClient.invalidateBallot();
  await waitForExpectStatus(
    'waiting_for_invalidated_ballot_confirmation.paper_present'
  );

  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(
    getDefaultPaperHandlerStatus()
  );
  await waitForExpectStatus(
    'waiting_for_invalidated_ballot_confirmation.paper_absent'
  );
  await apiClient.confirmInvalidateBallot();
  await waitForExpectStatus('accepting_paper');
});

test('ballot validation flow', async () => {
  await configureForTestElection();
  // Skip session start, paper load, etc stages
  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(
    getPaperInFrontStatus()
  );
  stateMachine.setInterpretationFixture();
  await waitForExpectStatus('presenting_ballot');
  await apiClient.validateBallot();
  await waitForExpectStatus('ejecting_to_rear');
});

test('setPatDeviceIsCalibrated', async () => {
  expect(await apiClient.getPaperHandlerState()).toEqual('not_accepting_paper');
  mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
    true
  );
  await waitForExpectStatus('pat_device_connected');

  await apiClient.setPatDeviceIsCalibrated();
  await waitForExpectStatus('not_accepting_paper');
});
