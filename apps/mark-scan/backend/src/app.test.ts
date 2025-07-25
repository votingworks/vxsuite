import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { assert, deferred, err, find, mapObject } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  systemSettings,
  electionTwoPartyPrimaryFixtures,
  electionGeneralFixtures,
  readElectionGeneral,
  readElectionGeneralDefinition,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
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
import { Buffer } from 'node:buffer';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { Server } from 'node:http';
import * as grout from '@votingworks/grout';
import {
  CandidateVote,
  DEFAULT_SYSTEM_SETTINGS,
  DEV_MACHINE_ID,
  Election,
  ElectionDefinition,
  HmpbBallotPaperSize,
  UiStringsPackage,
  VotesDict,
  convertVxfElectionToCdfBallotDefinition,
  safeParseElectionDefinition,
  safeParseSystemSettings,
} from '@votingworks/types';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { MockPaperHandlerDriver } from '@votingworks/custom-paper-handler';
import { LogEventId, Logger, mockBaseLogger } from '@votingworks/logging';
import { AddressInfo } from 'node:net';
import { SimulatedClock } from 'xstate/lib/SimulatedClock';
import { BLANK_PAGE_IMAGE_DATA } from '@votingworks/image-utils';
import {
  createApp,
  waitForStatus as waitForStatusHelper,
} from '../test/app_helpers';
import { Api, buildApp } from './app';
import {
  ACCEPTED_PAPER_TYPES,
  delays,
  PaperHandlerStateMachine,
  SimpleServerStatus,
} from './custom-paper-handler';
import { ElectionState } from './types';
import {
  mockCardlessVoterAuth,
  mockElectionManagerAuth,
  mockPollWorkerAuth,
} from '../test/auth_helpers';
import { PatConnectionStatusReader } from './pat-input/connection_status_reader';
import { createWorkspace } from './util/workspace';

const TEST_POLLING_INTERVAL_MS = 15;

vi.mock(import('./pat-input/connection_status_reader.js'));

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

let apiClient: grout.Client<Api>;
let mockAuth: InsertedSmartCardAuthApi;
let mockUsbDrive: MockUsbDrive;
let server: Server;
let stateMachine: PaperHandlerStateMachine;
let driver: MockPaperHandlerDriver;
let patConnectionStatusReader: PatConnectionStatusReader;
let logger: Logger;
let clock: SimulatedClock;

beforeEach(async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.MARK_SCAN_USE_BMD_150
  );

  const mockWorkspaceDir = makeTemporaryDirectory();
  patConnectionStatusReader = new PatConnectionStatusReader(
    logger,
    'bmd-150',
    mockWorkspaceDir
  );
  vi.mocked(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
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
  clock = result.clock;
});

afterEach(async () => {
  featureFlagMock.resetFeatureFlags();
  await stateMachine.cleanUp();
  server.close();
});

async function waitForStatus(status: SimpleServerStatus): Promise<void> {
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
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
    screenOrientation: 'portrait',
  });
});

test('configureElectionPackageFromUsb reads to and writes from store', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  mockElectionManagerAuth(mockAuth, electionDefinition);
  await setUpUsbAndConfigureElection(electionDefinition);
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionConfigured,
    expect.objectContaining({
      disposition: 'success',
    })
  );

  const readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  const electionRecord = await apiClient.getElectionRecord();
  expect(electionRecord).toEqual({
    electionDefinition,
    electionPackageHash: expect.any(String),
  });
});

test('unconfigureMachine deletes system settings and election definition', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  mockElectionManagerAuth(mockAuth, electionDefinition);
  mockElectionManagerAuth(mockAuth, electionDefinition);
  let readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );

  await setUpUsbAndConfigureElection(electionDefinition);
  await apiClient.unconfigureMachine();
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionUnconfigured,
    expect.objectContaining({
      disposition: 'success',
    })
  );

  readResult = await apiClient.getSystemSettings();
  expect(readResult).toEqual(DEFAULT_SYSTEM_SETTINGS);
  const electionDefinitionResult = await apiClient.getElectionRecord();
  expect(electionDefinitionResult).toBeNull();
});

test('configureElectionPackageFromUsb throws when no USB drive mounted', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
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
  vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
    status: 'logged_out',
    reason: 'no_card',
  });

  mockUsbDrive.insertUsbDrive({
    'some-election': {
      [ELECTION_PACKAGE_FOLDER]: {
        'test-election-package.zip': Buffer.from("doesn't matter"),
      },
    },
  });

  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result).toEqual(err('auth_required_before_election_package_load'));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionConfigured,
    expect.objectContaining({
      disposition: 'failure',
    })
  );
});

test('configure with CDF election', async () => {
  const electionGeneral = readElectionGeneral();
  const cdfElection = convertVxfElectionToCdfBallotDefinition(electionGeneral);
  const cdfElectionDefinition = safeParseElectionDefinition(
    JSON.stringify(cdfElection)
  ).unsafeUnwrap();
  mockElectionManagerAuth(mockAuth, cdfElectionDefinition);
  await setUpUsbAndConfigureElection(cdfElectionDefinition);

  const electionRecord = await apiClient.getElectionRecord();
  expect(electionRecord?.electionDefinition.election.id).toEqual(
    electionGeneral.id
  );

  // Ensure loading auth election key from db works
  expect(await apiClient.getAuthStatus()).toMatchObject({
    status: 'logged_in',
  });
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
    electionFamousNames2021Fixtures.readElectionDefinition()
  );
  usbDrive.eject.expectCallWith().resolves();
  await apiClient.ejectUsbDrive();
});

async function expectElectionState(expected: Partial<ElectionState>) {
  expect(await apiClient.getElectionState()).toMatchObject(expected);
}

test('single precinct election automatically has precinct set on configure', async () => {
  await setUpUsbAndConfigureElection(
    electionTwoPartyPrimaryFixtures.makeSinglePrecinctElectionDefinition()
  );

  await expectElectionState({
    precinctSelection: singlePrecinctSelectionFor('precinct-1'),
  });
});

test('polls state', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  await expectElectionState({ pollsState: 'polls_closed_initial' });

  await setUpUsbAndConfigureElection(electionDefinition);
  await expectElectionState({ pollsState: 'polls_closed_initial' });

  mockPollWorkerAuth(mockAuth, electionDefinition);
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

test('"test" mode', async () => {
  await expectElectionState({ isTestMode: true });

  await setUpUsbAndConfigureElection(
    electionFamousNames2021Fixtures.readElectionDefinition()
  );
  expect(logger.logAsCurrentRole).toHaveBeenCalledTimes(1);

  await apiClient.setTestMode({ isTestMode: false });
  await expectElectionState({ isTestMode: false });
  expect(logger.logAsCurrentRole).toHaveBeenCalledTimes(3);
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ToggledTestMode,
    {
      disposition: 'success',
      message: expect.anything(),
      isTestMode: false,
    }
  );

  await apiClient.setTestMode({ isTestMode: true });
  await expectElectionState({ isTestMode: true });
  expect(logger.logAsCurrentRole).toHaveBeenCalledTimes(5);
});

test('setting precinct', async () => {
  expect(
    (await apiClient.getElectionState()).precinctSelection
  ).toBeUndefined();

  await setUpUsbAndConfigureElection(
    electionFamousNames2021Fixtures.readElectionDefinition()
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
  const electionDefinition = readElectionGeneralDefinition();
  await configureForTestElection(electionDefinition);

  await suppressingConsoleOutput(async () => {
    await expect(apiClient.confirmBallotBoxEmptied()).rejects.toThrow(
      'Expected pollworker auth'
    );
  });
});

test('empty ballot box', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  await configureForTestElection(electionDefinition);
  mockPollWorkerAuth(mockAuth, electionDefinition);

  await apiClient.confirmBallotBoxEmptied();
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BallotBoxEmptied,
    'poll_worker'
  );
});

test('getPaperHandlerState returns state machine state', async () => {
  const electionDefinition = readElectionGeneralDefinition();
  await configureForTestElection(electionDefinition);
  await apiClient.setAcceptingPaperState({ paperTypes: ACCEPTED_PAPER_TYPES });
  expect(await apiClient.getPaperHandlerState()).toEqual('accepting_paper');
});

test('getInterpretation returns null if no interpretation is stored on the state machine', async () => {
  expect(await apiClient.getInterpretation()).toEqual(null);
});

async function mockLoadFlow(
  testApiClient: grout.Client<Api>,
  testDriver: MockPaperHandlerDriver
) {
  testDriver.setMockPaperContents(BLANK_PAGE_IMAGE_DATA);
  await testApiClient.setAcceptingPaperState({
    paperTypes: ACCEPTED_PAPER_TYPES,
  });
  await waitForStatus('accepting_paper');

  testDriver.setMockStatus('paperInserted');
  clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
  await waitForStatus('loading_new_sheet');

  clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
  await waitForStatus('waiting_for_voter_auth');

  mockCardlessVoterAuth(mockAuth);
  clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
  await waitForStatus('waiting_for_ballot_data');
}

test('ballot invalidation flow', async () => {
  const invalidateBallotMock = vi
    .spyOn(stateMachine, 'invalidateBallot')
    .mockReturnValue();

  await apiClient.invalidateBallot();
  expect(invalidateBallotMock).toHaveBeenCalledTimes(1);

  const confirmInvalidBallotMock = vi
    .spyOn(stateMachine, 'confirmInvalidateBallot')
    .mockReturnValue();

  await apiClient.confirmInvalidateBallot();
  expect(confirmInvalidBallotMock).toHaveBeenCalledTimes(1);
});

test('ballot validation flow', async () => {
  const validateBallotMock = vi
    .spyOn(stateMachine, 'validateBallot')
    .mockReturnValue();

  await apiClient.validateBallot();

  expect(validateBallotMock).toHaveBeenCalledTimes(1);
});

test('setPatDeviceIsCalibrated', async () => {
  const setPatDeviceIsCalibratedMock = vi
    .spyOn(stateMachine, 'setPatDeviceIsCalibrated')
    .mockReturnValue();

  await apiClient.setPatDeviceIsCalibrated();

  expect(setPatDeviceIsCalibratedMock).toHaveBeenCalledTimes(1);
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

test.each([
  { hmpbPaperSize: HmpbBallotPaperSize.Letter },
  { hmpbPaperSize: HmpbBallotPaperSize.Legal },
  { hmpbPaperSize: HmpbBallotPaperSize.Custom22 },
])(
  'printing BMDBs when HMPBs are on $hmpbPaperSize',
  async ({ hmpbPaperSize }) => {
    const pdfDatas: Uint8Array[] = [];
    const originalPrintBallot = stateMachine.printBallot;
    vi.spyOn(stateMachine, 'printBallot').mockImplementation((pdfData) => {
      pdfDatas.push(Uint8Array.from(pdfData));
      return originalPrintBallot(pdfData);
    });

    const deferredEjection = deferred<boolean>();
    const mockEject = vi.spyOn(driver, 'ejectBallotToRear');
    mockEject.mockReturnValue(deferredEjection.promise);

    const baseElection = getMockMultiLanguageElectionDefinition(
      readElectionGeneralDefinition(),
      ['en', 'zh-Hans']
    ).election;
    const election: Election = {
      ...baseElection,
      ballotLayout: {
        ...baseElection.ballotLayout,
        paperSize: hmpbPaperSize,
      },
    };
    const electionDefinition = safeParseElectionDefinition(
      JSON.stringify(election)
    ).unsafeUnwrap();

    await configureForTestElection(
      electionDefinition,
      electionGeneralFixtures.uiStrings
    );

    await expectElectionState({ ballotsPrintedCount: 0 });

    // vote a ballot in English
    await mockLoadFlow(apiClient, driver);
    const mockVotes = generateMockVotes(electionDefinition.election);

    // Add extreme-case write-in to track handling of long names with no breaks.
    const maxWriteInChars = 40 - 'WRITEIN'.length;
    const fillCharCount = maxWriteInChars - 'WRITEIN'.length;
    const writeInName = `WRITEIN${'N'.repeat(fillCharCount)}`;

    const writeInContest = find(
      electionDefinition.election.contests,
      (c) => c.type === 'candidate' && c.allowWriteIns && c.seats === 1
    );
    mockVotes[writeInContest.id] = [
      {
        id: `write-in-${writeInName}`,
        isWriteIn: true,
        name: writeInName,
      },
    ];

    await apiClient.printBallot({
      precinctId: '21',
      ballotStyleId: electionDefinition.election.ballotStyles.find(
        (bs) => bs.languages?.includes('en')
      )!.id,
      votes: mockVotes,
      languageCode: 'en',
    });

    await expectElectionState({ ballotsPrintedCount: 1 });
    const pdfData = pdfDatas[0];
    await expect(pdfData).toMatchPdfSnapshot({ failureThreshold: 0.034 });

    await waitForStatus('presenting_ballot');
    const interpretation = await apiClient.getInterpretation();
    assert(interpretation);
    assert(interpretation.type === 'InterpretedBmdPage');
    expectVotesEqual(interpretation.votes, mockVotes);

    await apiClient.validateBallot();
    await waitForStatus('ejecting_to_rear');
    deferredEjection.resolve(true);
    driver.setMockStatus('noPaper');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('ballot_accepted');

    clock.increment(delays.DELAY_NOTIFICATION_DURATION_MS);
    await waitForStatus('not_accepting_paper');
    mockPollWorkerAuth(mockAuth, electionDefinition);

    // vote a ballot in Chinese
    await mockLoadFlow(apiClient, driver);
    await apiClient.printBallot({
      precinctId: '21',
      ballotStyleId: electionDefinition.election.ballotStyles.find(
        (bs) => bs.languages?.includes('zh-Hans')
      )!.id,
      votes: mockVotes,
      languageCode: 'zh-Hans',
    });

    await expectElectionState({ ballotsPrintedCount: 2 });
    const pdfDataChinese = pdfDatas[1];
    await expect(pdfDataChinese).toMatchPdfSnapshot({
      failureThreshold: 0.034,
    });

    await waitForStatus('presenting_ballot');
    const interpretationChinese = await apiClient.getInterpretation();
    assert(interpretationChinese);
    assert(interpretationChinese.type === 'InterpretedBmdPage');
    expectVotesEqual(interpretationChinese.votes, mockVotes);
  }
);

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
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
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
