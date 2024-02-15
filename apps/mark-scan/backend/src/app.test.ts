import { assert } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  systemSettings,
  electionTwoPartyPrimaryFixtures,
  electionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  mockOf,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
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
  SystemSettingsSchema,
  safeParseJson,
  safeParseSystemSettings,
} from '@votingworks/types';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import { createApp } from '../test/app_helpers';
import { Api } from './app';
import { PaperHandlerStateMachine } from './custom-paper-handler';
import { ElectionState } from './types';

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
let logger: Logger;

beforeEach(async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  const result = await createApp();
  apiClient = result.apiClient;
  logger = result.logger;
  mockAuth = result.mockAuth;
  mockUsbDrive = result.mockUsbDrive;
  server = result.server;
  stateMachine = result.stateMachine;
});

afterEach(() => {
  stateMachine.stopMachineService();
  server?.close();
  jest.resetAllMocks();
});

async function setUpUsbAndConfigureElection(
  electionDefinition: ElectionDefinition
) {
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings: safeParseSystemSettings(
        systemSettings.asText()
      ).unsafeUnwrap(),
    })
  );

  const writeResult = await apiClient.configureElectionPackageFromUsb();
  assert(writeResult.isOk());
}

function mockElectionManagerAuth(electionDefinition: ElectionDefinition) {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
}

function mockPollWorkerAuth(electionDefinition: ElectionDefinition) {
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakePollWorkerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
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

  mockElectionManagerAuth(electionDefinition);
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

  mockElectionManagerAuth(electionDefinition);
  mockElectionManagerAuth(electionDefinition);
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
  mockElectionManagerAuth(electionDefinition);

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

  usbDrive.eject.expectCallWith('unknown').resolves();
  await apiClient.ejectUsbDrive();

  mockElectionManagerAuth(electionFamousNames2021Fixtures.electionDefinition);
  usbDrive.eject.expectCallWith('election_manager').resolves();
  await apiClient.ejectUsbDrive();
});

async function expectElectionState(expected: Partial<ElectionState>) {
  expect(await apiClient.getElectionState()).toMatchObject(expected);
}

async function configureMachine(
  usbDrive: MockUsbDrive,
  electionDefinition: ElectionDefinition
) {
  mockElectionManagerAuth(electionDefinition);

  usbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings: safeParseJson(
        systemSettings.asText(),
        SystemSettingsSchema
      ).unsafeUnwrap(),
    })
  );

  const writeResult = await apiClient.configureElectionPackageFromUsb();
  assert(writeResult.isOk());

  usbDrive.removeUsbDrive();
}

test('single precinct election automatically has precinct set on configure', async () => {
  await configureMachine(
    mockUsbDrive,
    electionTwoPartyPrimaryFixtures.singlePrecinctElectionDefinition
  );

  await expectElectionState({
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
  });
});

test('polls state', async () => {
  await expectElectionState({ pollsState: 'polls_closed_initial' });

  await configureMachine(
    mockUsbDrive,
    electionFamousNames2021Fixtures.electionDefinition
  );
  await expectElectionState({ pollsState: 'polls_closed_initial' });

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

  await configureMachine(
    mockUsbDrive,
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

  await configureMachine(
    mockUsbDrive,
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
});

test('printing a ballot increments the printed ballot count', async () => {
  await expectElectionState({ ballotsPrintedCount: 0 });

  await configureMachine(
    mockUsbDrive,
    electionFamousNames2021Fixtures.electionDefinition
  );
  await expectElectionState({ ballotsPrintedCount: 0 });

  await apiClient.printBallot({ pdfData: Buffer.from('pdf data') });
  await expectElectionState({ ballotsPrintedCount: 1 });
});

test('empty ballot box requires poll worker auth', async () => {
  await configureMachine(mockUsbDrive, electionGeneralDefinition);

  await expect(apiClient.confirmBallotBoxEmptied()).rejects.toThrow(
    'Expected pollworker auth'
  );
});

test('empty ballot box', async () => {
  await configureMachine(mockUsbDrive, electionGeneralDefinition);
  mockPollWorkerAuth(electionGeneralDefinition);

  await apiClient.confirmBallotBoxEmptied();
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.BallotBoxEmptied,
    'poll_worker'
  );
});
