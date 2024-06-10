import { assert, mapObject } from '@votingworks/basics';
import tmp from 'tmp';
import {
  electionFamousNames2021Fixtures,
  systemSettings,
  electionTwoPartyPrimaryFixtures,
  electionGeneralDefinition,
  electionGeneralFixtures,
} from '@votingworks/fixtures';
import { mockOf, suppressingConsoleOutput } from '@votingworks/test-utils';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  ALL_PRECINCTS_SELECTION,
  ELECTION_PACKAGE_FOLDER,
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  generateMockVotes,
  singlePrecinctSelectionFor,
  getMockMultiLanguageElectionDefinition,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { Server } from 'http';
import * as grout from '@votingworks/grout';
import {
  CandidateVote,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  LanguageCode,
  UiStringsPackage,
  VotesDict,
  safeParseSystemSettings,
} from '@votingworks/types';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { MockPaperHandlerDriver } from '@votingworks/custom-paper-handler';
import { LogEventId, Logger } from '@votingworks/logging';
import { AddressInfo } from 'net';
import {
  createApp,
  waitForStatus as waitForStatusHelper,
} from '../test/app_helpers';
import { Api, buildApp } from './app';
import { PaperHandlerStateMachine } from './custom-paper-handler';
import { ElectionState } from './types';
import {
  mockElectionManagerAuth,
  mockPollWorkerAuth,
} from '../test/auth_helpers';
import { PatConnectionStatusReader } from './pat-input/connection_status_reader';
import { createWorkspace } from './util/workspace';
import {
  getDefaultPaperHandlerStatus,
  getPaperInFrontStatus,
  getPaperParkedStatus,
} from './custom-paper-handler/test_utils';

const TEST_POLLING_INTERVAL_MS = 5;

jest.mock('@votingworks/custom-paper-handler');
jest.mock('./pat-input/connection_status_reader');

const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
    randomBallotId: () => '12345',
  };
});

let apiClient: grout.Client<Api>;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsbDrive: MockUsbDrive;
let server: Server;
let stateMachine: PaperHandlerStateMachine;
let driver: MockPaperHandlerDriver;
let patConnectionStatusReader: PatConnectionStatusReader;
let logger: Logger;

beforeEach(async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER
  );

  patConnectionStatusReader = new PatConnectionStatusReader(logger);
  mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
    false
  );

  const result = await createApp({
    patConnectionStatusReader,
    pollingIntervalMs: TEST_POLLING_INTERVAL_MS,
  });
  apiClient = result.apiClient;
  logger = result.logger;
  mockAuth = result.mockAuth;
  mockUsbDrive = result.mockUsbDrive;
  server = result.server;
  stateMachine = result.stateMachine;
  driver = result.driver;
});

afterEach(async () => {
  featureFlagMock.resetFeatureFlags();
  await stateMachine.cleanUp();
  server?.close();
});

async function waitForStatus(status: string): Promise<void> {
  await waitForStatusHelper(apiClient, TEST_POLLING_INTERVAL_MS, status);
}

async function setUpUsbAndConfigureElection(
  electionDefinition: ElectionDefinition,
  uiStrings?: UiStringsPackage
) {
  mockElectionManagerAuth(mockAuth, electionDefinition);
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings: safeParseSystemSettings(
        systemSettings.asText()
      ).unsafeUnwrap(),
      uiStrings,
    })
  );

  const writeResult = await apiClient.configureElectionPackageFromUsb();
  assert(
    writeResult.isOk(),
    `Failed to configure election package from USB with error ${writeResult.err()}`
  );
}

async function configureForTestElection(
  electionDefinition: ElectionDefinition,
  uiStrings?: UiStringsPackage
) {
  await setUpUsbAndConfigureElection(electionDefinition, uiStrings);
  await apiClient.setPrecinctSelection({
    precinctSelection: singlePrecinctSelectionFor(
      electionDefinition.election.precincts[1].id
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
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PollsOpened,
    'poll_worker',
    { disposition: 'success' }
  );
  await expectElectionState({ pollsState: 'polls_open' });

  await apiClient.setPollsState({ pollsState: 'polls_paused' });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.VotingPaused,
    'poll_worker',
    { disposition: 'success' }
  );
  await expectElectionState({ pollsState: 'polls_paused' });

  await apiClient.setPollsState({ pollsState: 'polls_open' });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.VotingResumed,
    'poll_worker',
    { disposition: 'success' }
  );
  await expectElectionState({ pollsState: 'polls_open' });

  await apiClient.setPollsState({ pollsState: 'polls_closed_final' });
  expect(logger.log).toHaveBeenCalledWith(
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
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.PrecinctConfigurationChanged,
    {
      disposition: 'success',
      message: 'User set the precinct for the machine to North Lincoln',
    }
  );
});

test('empty ballot box requires poll worker auth', async () => {
  await configureForTestElection(electionGeneralDefinition);

  await suppressingConsoleOutput(async () => {
    await expect(apiClient.confirmBallotBoxEmptied()).rejects.toThrow(
      'Expected pollworker auth'
    );
  });
});

test('empty ballot box', async () => {
  await configureForTestElection(electionGeneralDefinition);
  mockPollWorkerAuth(mockAuth, electionGeneralDefinition);

  await apiClient.confirmBallotBoxEmptied();
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BallotBoxEmptied,
    'poll_worker'
  );
});

test('getPaperHandlerState returns state machine state', async () => {
  await configureForTestElection(electionGeneralDefinition);
  await apiClient.setAcceptingPaperState();
  expect(await apiClient.getPaperHandlerState()).toEqual('accepting_paper');
});

test('getInterpretation returns null if no interpretation is stored on the state machine', async () => {
  expect(await apiClient.getInterpretation()).toEqual(null);
});

async function mockLoadFlow(
  testApiClient: grout.Client<Api>,
  testDriver: MockPaperHandlerDriver
) {
  await testApiClient.setAcceptingPaperState();
  mockOf(testDriver.getPaperHandlerStatus).mockResolvedValue(
    getPaperInFrontStatus()
  );
  await waitForStatus('loading_paper');
  mockOf(testDriver.getPaperHandlerStatus).mockResolvedValue(
    getPaperParkedStatus()
  );
  await waitForStatus('waiting_for_ballot_data');
}

async function mockLoadAndPrint(
  testApiClient: grout.Client<Api>,
  testDriver: MockPaperHandlerDriver
) {
  await mockLoadFlow(testApiClient, testDriver);
  await testApiClient.printBallot({
    languageCode: LanguageCode.ENGLISH,
    precinctId: '21',
    ballotStyleId: '12',
    votes: {},
  });
  await waitForStatus('presenting_ballot');
}

test('ballot invalidation flow', async () => {
  await configureForTestElection(electionGeneralDefinition);
  await mockLoadAndPrint(apiClient, driver);
  await apiClient.invalidateBallot();
  await waitForStatus(
    'waiting_for_invalidated_ballot_confirmation.paper_present'
  );

  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(
    getDefaultPaperHandlerStatus()
  );
  await waitForStatus(
    'waiting_for_invalidated_ballot_confirmation.paper_absent'
  );
  await apiClient.confirmInvalidateBallot();
  await waitForStatus('accepting_paper');
});

test('ballot validation flow', async () => {
  await configureForTestElection(electionGeneralDefinition);
  await mockLoadAndPrint(apiClient, driver);
  await apiClient.validateBallot();
  await waitForStatus('ejecting_to_rear');
});

test('removing ballot during presentation', async () => {
  await configureForTestElection(electionGeneralDefinition);
  await mockLoadAndPrint(apiClient, driver);
  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(
    getDefaultPaperHandlerStatus()
  );
  await waitForStatus('ballot_removed_during_presentation');
  await apiClient.confirmSessionEnd();
  await waitForStatus('not_accepting_paper');
});

test('setPatDeviceIsCalibrated', async () => {
  expect(await apiClient.getPaperHandlerState()).toEqual('not_accepting_paper');
  mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
    true
  );
  await waitForStatus('pat_device_connected');

  await apiClient.setPatDeviceIsCalibrated();
  await waitForStatus('not_accepting_paper');
});

function sortVotes(votes: VotesDict): VotesDict {
  return mapObject(votes, (vote) => {
    assert(vote);

    if (typeof vote[0] === 'object') {
      return (vote as CandidateVote)
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));
    }

    return vote.slice().sort();
  });
}

function expectVotesEqual(expected: VotesDict, actual: VotesDict) {
  expect(sortVotes(actual)).toEqual(sortVotes(expected));
}

test('printing ballots', async () => {
  const printBallotSpy = jest.spyOn(stateMachine, 'printBallot');

  const electionDefinition = getMockMultiLanguageElectionDefinition(
    electionGeneralDefinition,
    [LanguageCode.ENGLISH, LanguageCode.CHINESE_SIMPLIFIED]
  );
  await configureForTestElection(
    electionDefinition,
    electionGeneralFixtures.ELECTION_GENERAL_TEST_UI_STRINGS_CHINESE_SIMPLIFIED
  );

  await expectElectionState({ ballotsPrintedCount: 0 });

  // vote a ballot in English
  await mockLoadFlow(apiClient, driver);
  const mockVotes = generateMockVotes(electionDefinition.election);
  await apiClient.printBallot({
    precinctId: '21',
    ballotStyleId: electionDefinition.election.ballotStyles.find(
      (bs) => bs.languages?.includes(LanguageCode.ENGLISH)
    )!.id,
    votes: mockVotes,
    languageCode: LanguageCode.ENGLISH,
  });

  await expectElectionState({ ballotsPrintedCount: 1 });
  const pdfData = printBallotSpy.mock.calls[0][0];
  await expect(pdfData).toMatchPdfSnapshot();

  await waitForStatus('presenting_ballot');
  const interpretation = await apiClient.getInterpretation();
  assert(interpretation);
  expect(interpretation.type).toEqual('InterpretedBmdPage');
  expectVotesEqual(interpretation.votes, mockVotes);

  await apiClient.validateBallot();
  await waitForStatus('ejecting_to_rear');
  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(
    getDefaultPaperHandlerStatus()
  );
  await waitForStatus('not_accepting_paper');

  // vote a ballot in Chinese
  await mockLoadFlow(apiClient, driver);
  await apiClient.printBallot({
    precinctId: '21',
    ballotStyleId: electionDefinition.election.ballotStyles.find(
      (bs) => bs.languages?.includes(LanguageCode.CHINESE_SIMPLIFIED)
    )!.id,
    votes: mockVotes,
    languageCode: LanguageCode.CHINESE_SIMPLIFIED,
  });

  await expectElectionState({ ballotsPrintedCount: 2 });
  const pdfDataChinese = printBallotSpy.mock.calls[1][0];
  await expect(pdfDataChinese).toMatchPdfSnapshot({ failureThreshold: 0.1 });

  await waitForStatus('presenting_ballot');
  const interpretationChinese = await apiClient.getInterpretation();
  assert(interpretationChinese);
  expect(interpretationChinese.type).toEqual('InterpretedBmdPage');
  expectVotesEqual(interpretationChinese.votes, mockVotes);
});

test('addDiagnosticRecord', async () => {
  await apiClient.addDiagnosticRecord({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
    message: 'test message',
  });
  const diagnostic = await apiClient.getMostRecentDiagnostic({
    diagnosticType: 'mark-scan-accessible-controller',
  });
  assert(diagnostic, 'Expected diagnostic to be defined');
  expect(diagnostic.type).toEqual('mark-scan-accessible-controller');
  expect(diagnostic.outcome).toEqual('pass');
  expect(diagnostic.message).toEqual('test message');
});

test('startPaperHandlerDiagnostic fails test if no state machine', async () => {
  const workspace = createWorkspace(tmp.dirSync().name);
  const app = buildApp(mockAuth, logger, workspace, mockUsbDrive.usbDrive);
  const serverNoStateMachine = app.listen();
  const { port } = serverNoStateMachine.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  const apiClientNoStateMachine = grout.createClient<Api>({ baseUrl });
  await apiClientNoStateMachine.startPaperHandlerDiagnostic();
  const diagnostic = await apiClientNoStateMachine.getMostRecentDiagnostic({
    diagnosticType: 'mark-scan-paper-handler',
  });
  expect(diagnostic?.outcome).toEqual('fail');
});
