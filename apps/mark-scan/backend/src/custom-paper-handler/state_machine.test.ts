/* eslint-disable vx/gts-no-public-class-fields */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import HID from 'node-hid';
import {
  MockPaperHandlerDriver,
  MockPaperHandlerStatus,
  PaperHandlerDriverInterface,
} from '@votingworks/custom-paper-handler';
import { Buffer } from 'node:buffer';
import { dirSync } from 'tmp';
import {
  BaseLogger,
  LogEventId,
  mockBaseLogger,
  MockLogger,
  mockLogger,
} from '@votingworks/logging';
import {
  InsertedSmartCardAuthApi,
  buildMockInsertedSmartCardAuth,
} from '@votingworks/auth';
import { assert, Deferred, deferred, iter, sleep } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireHudsonFixtures,
  readElectionGeneralDefinition,
  systemSettings,
} from '@votingworks/fixtures';
import {
  BallotId,
  BallotStyleId,
  BallotType,
  PageInterpretationType,
  SheetOf,
  TEST_JURISDICTION,
  safeParseSystemSettings,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  renderBmdBallotFixture,
  writeFirstBallotPageToImageFile,
} from '@votingworks/bmd-ballot-fixtures';
import {
  InterpretFileResult,
  interpretSimplexBmdBallot,
} from '@votingworks/ballot-interpreter';
import {
  BLANK_PAGE_IMAGE_DATA,
  loadImageData,
  writeImageData,
} from '@votingworks/image-utils';
import { join } from 'node:path';
import { SimulatedClock } from 'xstate/lib/SimulatedClock';
import {
  ACCEPTED_PAPER_TYPES,
  PaperHandlerStateMachine,
  delays,
  getPaperHandlerStateMachine,
  paperHandlerStatusToEvent,
} from './state_machine';
import { Workspace, createWorkspace } from '../util/workspace';
import {
  PatConnectionStatusReader,
  PatConnectionStatusReaderInterface,
} from '../pat-input/connection_status_reader';
import { getPaperInRearStatus } from './test_utils';
import { SimpleServerStatus } from '.';
import {
  loadAndParkPaper,
  printBallotChunks,
  resetAndReconnect,
  scanAndSave,
} from './application_driver';
import {
  mockCardlessVoterAuth,
  mockElectionManagerAuth,
  mockLoggedOutAuth,
  mockPollWorkerAuth,
  mockSystemAdminAuth,
} from '../../test/auth_helpers';
import { MAX_BALLOT_BOX_CAPACITY } from './constants';
import {
  GPIO_PATH_PREFIX,
  ORIGIN_SWIFTY_PRODUCT_ID,
  ORIGIN_VENDOR_ID,
} from '../pat-input/constants';
import {
  BLANK_PAGE_INTERPRETATION_MOCK,
  BLANK_PAGE_MOCK,
} from '../../test/ballot_helpers';
import { AudioOutput, setAudioOutput } from '../audio/outputs';
import { BmdModelNumber } from '../types';

const electionGeneralDefinition = readElectionGeneralDefinition();

vi.mock(import('@votingworks/ballot-interpreter'), async (importActual) => ({
  ...(await importActual()),
  interpretSimplexBmdBallot: vi.fn(),
}));
vi.mock(import('./application_driver.js'), async (importActual) => ({
  ...(await importActual()),
  loadAndParkPaper: vi.fn(),
  printBallotChunks: vi.fn(),
  resetAndReconnect: vi.fn(),
  scanAndSave: vi.fn(),
  scanAndInterpretBallot: vi.fn(),
}));
vi.mock(
  import('../pat-input/connection_status_reader.js'),
  async (importActual) => ({
    ...(await importActual()),
    PatConnectionStatusReader: class implements PatConnectionStatusReader {
      constructor(
        readonly logger: BaseLogger,
        readonly bmdModelNumber: BmdModelNumber,
        readonly workspacePath: string,
        readonly gpioPathPrefix: string = GPIO_PATH_PREFIX
      ) {}

      openBmd155 = vi.fn();
      openBmd150 = vi.fn();
      open = vi.fn();
      close = vi.fn();
      isPatDeviceConnected = vi.fn();
    },
  })
);
vi.mock(import('node-hid'));

let driver: MockPaperHandlerDriver;
let workspace: Workspace;
let machine: PaperHandlerStateMachine;
let logger: MockLogger<typeof vi.fn>;
let patConnectionStatusReader: PatConnectionStatusReaderInterface;
let auth: InsertedSmartCardAuthApi;
let ballotPdfData: Buffer;
let scannedBallotFixtureFilepaths: string;
let clock: SimulatedClock;

const precinctId = electionGeneralDefinition.election.precincts[1].id;
const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));
vi.mock(import('../audio/outputs.js'));
vi.setConfig({ testTimeout: 2000 });

const SUCCESSFUL_INTERPRETATION_MOCK: SheetOf<InterpretFileResult> = [
  {
    interpretation: {
      type: 'InterpretedBmdPage',
      ballotId: '1_en' as BallotId,
      metadata: {
        ballotHash: 'hash',
        ballotType: BallotType.Precinct,
        ballotStyleId: '5' as BallotStyleId,
        precinctId: '21',
        isTestMode: true,
      },
      adjudicationInfo: {
        requiresAdjudication: false,
        ignoredReasonInfos: [],
        enabledReasonInfos: [],
        enabledReasons: [],
      },
      votes: {},
    },
    normalizedImage: BLANK_PAGE_IMAGE_DATA,
  },
  BLANK_PAGE_MOCK,
];

async function waitForStatus(status: SimpleServerStatus) {
  await vi.waitFor(() => {
    expect(machine.getSimpleStatus()).toEqual(status);
  });
}

function expectMockPaperHandlerStatus(
  mockDriver: MockPaperHandlerDriver,
  mockStatus: MockPaperHandlerStatus
) {
  expect(mockDriver.getMockStatus()).toEqual(mockStatus);
}

beforeAll(
  async () => {
    ballotPdfData = await renderBmdBallotFixture({
      electionDefinition: electionGeneralDefinition,
      frontPageOnly: true,
    });
    scannedBallotFixtureFilepaths =
      await writeFirstBallotPageToImageFile(ballotPdfData);
  },
  // Increase timeout for this hook only because ballot fixture
  // rendering can take a few seconds
  10_000
);

beforeEach(async () => {
  featureFlagMock.resetFeatureFlags();

  logger = mockLogger({ fn: vi.fn });
  auth = buildMockInsertedSmartCardAuth(vi.fn);
  workspace = createWorkspace(dirSync().name, mockBaseLogger({ fn: vi.fn }));
  workspace.store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash: 'test-election-package-hash',
  });
  workspace.store.setPrecinctSelection(singlePrecinctSelectionFor(precinctId));
  workspace.store.setSystemSettings(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  driver = new MockPaperHandlerDriver();
  clock = new SimulatedClock();

  patConnectionStatusReader = new PatConnectionStatusReader(
    logger,
    'bmd-150',
    workspace.path
  );
  vi.mocked(patConnectionStatusReader.open).mockResolvedValue(true);
  vi.mocked(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
    false
  );

  vi.mocked(HID.devices).mockReturnValue([]);

  machine = await getPaperHandlerStateMachine({
    workspace,
    auth,
    logger,
    driver,
    patConnectionStatusReader,
    clock,
  });
}, 10_000);

afterEach(async () => {
  await machine.cleanUp();
  vi.resetAllMocks();
}, 10_000);

async function setMockStatusAndIncrementClock(status: MockPaperHandlerStatus) {
  // Without this sleep the effects of `SimulatedCLock.increment()` are not
  // seen in the state machine. The exact reason is unclear but it could be
  // that control must be yielded back to the event loop to finish execution
  // before the state machine interpreter sees updates to SimulatedClock.
  await sleep(0);
  driver.setMockStatus(status);
  clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
}

async function setMockCoverOpen(isCoverOpen: boolean) {
  driver.setCoverOpen(isCoverOpen);
  clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
  await sleep(0);
}

describe('not_accepting_paper', () => {
  test('transitions to accepting_paper state on BEGIN_ACCEPTING_PAPER event', () => {
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');
  });

  test('ejects paper to front when paper is parked', async () => {
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    await setMockStatusAndIncrementClock('paperParked');
    await waitForStatus('ejecting_to_front');
  });

  test('ejects paper to front when paper is inside but not parked', async () => {
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    await setMockStatusAndIncrementClock('paperInScannerNotParked');
    await waitForStatus('ejecting_to_front');
  });
});

describe('eject_to_front', () => {
  test.each<{ description: string; mockStatus: MockPaperHandlerStatus }>([
    {
      description: 'paper is absent',
      mockStatus: 'noPaper',
    },
    {
      description: 'paper triggers all front sensors',
      mockStatus: 'paperInserted',
    },
    {
      description: 'paper only partially triggers front sensors',
      mockStatus: 'paperPartiallyInserted',
    },
  ])('transitions when $description', async ({ mockStatus }) => {
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    await setMockStatusAndIncrementClock('paperParked');
    await waitForStatus('ejecting_to_front');
    await setMockStatusAndIncrementClock(mockStatus);
    await waitForStatus('not_accepting_paper');
  });
});

describe('accepting_paper', () => {
  test('transitions to loading_paper state when front sensors are triggered', async () => {
    mockPollWorkerAuth(auth, electionGeneralDefinition);

    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
  });
});

test('logs when an auth error happens', async () => {
  // Transition to a state that polls auth
  vi.mocked(auth.getAuthStatus).mockRejectedValue(new Error('mock auth error'));
  machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);

  clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);

  await vi.waitFor(() => {
    expect(logger.log).toHaveBeenCalledWith(LogEventId.UnknownError, 'system', {
      message: 'mock auth error',
      stack: expect.any(String),
      disposition: 'failure',
    });
  });
});

describe('paper jam', () => {
  test('during voter session - logged out', async () => {
    const resetDriverResult = deferred<PaperHandlerDriverInterface>();
    vi.mocked(resetAndReconnect).mockImplementation(
      async () => resetDriverResult.promise
    );

    vi.mocked(auth.getAuthStatus).mockResolvedValue({
      status: 'logged_out',
      reason: 'no_card',
    });

    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');

    await setMockStatusAndIncrementClock('paperJammed');
    await waitForStatus('jammed');

    await setMockStatusAndIncrementClock('noPaper');
    await waitForStatus('jam_cleared');

    resetDriverResult.resolve(driver);
    await waitForStatus('not_accepting_paper');
  });

  test('during voter session - with poll worker auth', async () => {
    const resetDriverResult = deferred<PaperHandlerDriverInterface>();
    vi.mocked(resetAndReconnect).mockImplementation(
      async () => resetDriverResult.promise
    );

    mockCardlessVoterAuth(auth);
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);

    await setMockStatusAndIncrementClock('paperJammed');
    await waitForStatus('jammed');

    mockPollWorkerAuth(auth, electionGeneralDefinition);
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);

    await setMockStatusAndIncrementClock('noPaper');
    await waitForStatus('jam_cleared');

    resetDriverResult.resolve(driver);
    await waitForStatus('accepting_paper_after_jam');

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_paper_after_jam');
    // The mock driver will update the mock state automatically. Advance
    // the clock so the state machine can read the updated value.
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('paper_reloaded');
    expectMockPaperHandlerStatus(driver, 'paperParked');
  });

  test('during voter session - with cardless voter auth', async () => {
    const resetDriverResult = deferred<PaperHandlerDriverInterface>();
    vi.mocked(resetAndReconnect).mockImplementation(
      async () => resetDriverResult.promise
    );

    mockCardlessVoterAuth(auth);
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);

    await setMockStatusAndIncrementClock('paperJammed');
    await waitForStatus('jammed');

    await setMockStatusAndIncrementClock('noPaper');
    await waitForStatus('jam_cleared');

    resetDriverResult.resolve(driver);
    await waitForStatus('accepting_paper_after_jam');

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_paper_after_jam');
    // The mock driver will update the mock state automatically. Advance
    // the clock so the state machine can read the updated value.
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    expectMockPaperHandlerStatus(driver, 'paperParked');
    await waitForStatus('waiting_for_ballot_data');
  });

  test('jam_cleared triggered for JAMMED_STATUS_NO_PAPER event', async () => {
    await setMockStatusAndIncrementClock('paperJammed');
    await waitForStatus('jammed');

    await setMockStatusAndIncrementClock('paperJammedNoPaper');
    await waitForStatus('jam_cleared');
  });
});

async function writeTmpBlankImage(): Promise<string> {
  const path = join(dirSync().name, 'blank-image.jpg');
  await writeImageData(path, BLANK_PAGE_IMAGE_DATA);
  return path;
}

async function executeLoadPaper(
  options: { noVoterAuth?: boolean } = {}
): Promise<void> {
  // Restore the original `loadAndParkPaper`, so it calls the underlying
  // mock paper handler.
  vi.mocked(loadAndParkPaper).mockImplementation(
    (
      await vi.importActual<typeof import('./application_driver.js')>(
        './application_driver.js'
      )
    ).loadAndParkPaper
  );

  mockPollWorkerAuth(auth, electionGeneralDefinition);
  clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);

  machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
  await waitForStatus('accepting_paper');

  vi.mocked(scanAndSave).mockResolvedValue(await writeTmpBlankImage());
  vi.mocked(interpretSimplexBmdBallot).mockResolvedValue(
    BLANK_PAGE_INTERPRETATION_MOCK
  );

  await setMockStatusAndIncrementClock('paperInserted');
  await waitForStatus('loading_new_sheet');

  clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
  await waitForStatus('waiting_for_voter_auth');

  if (options.noVoterAuth) {
    return;
  }

  mockCardlessVoterAuth(auth);
  clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
  await waitForStatus('waiting_for_ballot_data');
}

// Sets up print and scan mocks. Executes the state machine from 'not_accepting_paper' to 'presenting_ballot'.
async function executePrintBallotAndAssert(
  printData: Buffer,
  scanFixtureFilepath: string,
  interpretationResult: SheetOf<InterpretFileResult> = SUCCESSFUL_INTERPRETATION_MOCK
): Promise<void> {
  await executeLoadPaper();

  vi.mocked(scanAndSave).mockReset();
  vi.mocked(interpretSimplexBmdBallot).mockReset();

  vi.mocked(printBallotChunks).mockResolvedValue();

  const mockScanResult = deferred<string>();
  vi.mocked(scanAndSave).mockReturnValue(mockScanResult.promise);

  const mockInterpretResult = deferred<SheetOf<InterpretFileResult>>();
  vi.mocked(interpretSimplexBmdBallot).mockReturnValue(
    mockInterpretResult.promise
  );

  void machine.printBallot(printData);
  await waitForStatus('printing_ballot');
  expect(printBallotChunks).toHaveBeenCalledTimes(1);

  await waitForStatus('scanning');
  expect(scanAndSave).toBeCalledTimes(1);

  mockScanResult.resolve(scanFixtureFilepath);
  await waitForStatus('interpreting');

  mockInterpretResult.resolve(interpretationResult);

  const scanFixtureImageData = await loadImageData(scanFixtureFilepath);
  expect(interpretSimplexBmdBallot).toHaveBeenCalledTimes(1);
  const {
    calls: [[frontImage]],
  } = vi.mocked(interpretSimplexBmdBallot).mock;

  assert(frontImage, 'No front image was passed to interpretSimplexBmdBallot');
  await expect(frontImage).toMatchImage(scanFixtureImageData);
}

test('voting flow happy path', async () => {
  await executePrintBallotAndAssert(
    ballotPdfData,
    scannedBallotFixtureFilepaths
  );

  await waitForStatus('presenting_ballot');
  expectMockPaperHandlerStatus(driver, 'presentingPaper');

  machine.validateBallot();
  await waitForStatus('ejecting_to_rear');

  expect(workspace.store.getBallotsCastSinceLastBoxChange()).toEqual(0);
  await setMockStatusAndIncrementClock('noPaper');
  await waitForStatus('ballot_accepted');
  expect(workspace.store.getBallotsCastSinceLastBoxChange()).toEqual(1);

  await waitForStatus('ballot_accepted');
  clock.increment(delays.DELAY_NOTIFICATION_DURATION_MS);
  await waitForStatus('not_accepting_paper');
});

test('ballot invalidation flow', async () => {
  await executePrintBallotAndAssert(
    ballotPdfData,
    scannedBallotFixtureFilepaths
  );

  await waitForStatus('presenting_ballot');
  expectMockPaperHandlerStatus(driver, 'presentingPaper');

  machine.invalidateBallot();
  mockPollWorkerAuth(auth, electionGeneralDefinition);
  await waitForStatus(
    'waiting_for_invalidated_ballot_confirmation.paper_present'
  );

  driver.setMockStatus('noPaper');
  clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
  await waitForStatus(
    'waiting_for_invalidated_ballot_confirmation.paper_absent'
  );
  machine.confirmInvalidateBallot();
  await waitForStatus('accepting_paper');
});

test('ballot box empty flow', async () => {
  workspace.store.setBallotsCastSinceLastBoxChange(MAX_BALLOT_BOX_CAPACITY - 1);

  await executePrintBallotAndAssert(
    ballotPdfData,
    scannedBallotFixtureFilepaths
  );

  await waitForStatus('presenting_ballot');
  expectMockPaperHandlerStatus(driver, 'presentingPaper');

  machine.validateBallot();
  await waitForStatus('ejecting_to_rear');

  await setMockStatusAndIncrementClock('noPaper');
  await waitForStatus('ballot_accepted');
  expect(workspace.store.getBallotsCastSinceLastBoxChange()).toEqual(
    MAX_BALLOT_BOX_CAPACITY
  );

  clock.increment(delays.DELAY_NOTIFICATION_DURATION_MS);
  await waitForStatus('empty_ballot_box');

  machine.confirmBallotBoxEmptied();
  await waitForStatus('not_accepting_paper');
});

test('elections with grid layouts still try to interpret BMD ballots', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireHudsonFixtures.readElectionDefinition();

  workspace.store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash: 'test-election-package-hash',
  });
  workspace.store.setPrecinctSelection(
    singlePrecinctSelectionFor(electionDefinition.election.precincts[0].id)
  );

  await executePrintBallotAndAssert(
    ballotPdfData,
    scannedBallotFixtureFilepaths
  );
});

test('blank page interpretation', async () => {
  const mockScannedBallotImagePath = await writeTmpBlankImage();

  await executePrintBallotAndAssert(
    ballotPdfData,
    mockScannedBallotImagePath,
    BLANK_PAGE_INTERPRETATION_MOCK
  );

  await waitForStatus('blank_page_interpretation');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BlankInterpretation,
    'system'
  );

  // Remove blank ballot
  mockPollWorkerAuth(auth, electionGeneralDefinition);
  expectMockPaperHandlerStatus(driver, 'presentingPaper');
  await setMockStatusAndIncrementClock('noPaper');
  await waitForStatus('blank_page_interpretation');

  // Prepare to insert new sheet
  await setMockStatusAndIncrementClock('paperInserted');
  await waitForStatus('blank_page_interpretation');

  expectMockPaperHandlerStatus(driver, 'paperParked');
  clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);

  await waitForStatus('paper_reloaded');

  const ballotStyle = electionGeneralDefinition.election.ballotStyles[1];
  // The fixture expects ballot style id 5
  assert(ballotStyle.id === '5');

  mockCardlessVoterAuth(auth, {
    ballotStyleId: ballotStyle.id,
    precinctId,
  });
  clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
  await waitForStatus('waiting_for_ballot_data');
});

test('cleanUp', async () => {
  vi.spyOn(driver, 'disconnect');
  await machine.cleanUp();
  expect(driver.disconnect).toHaveBeenCalledTimes(1);
});

test('getRawDeviceStatus', async () => {
  driver.setMockStatus('paperJammedNoPaper');
  const rawStatus = await machine.getRawDeviceStatus();
  expect(rawStatus).toEqual(await driver.getPaperHandlerStatus());
});

describe('paperHandlerStatusToEvent', () => {
  test('PAPER_IN_OUTPUT', () => {
    expect(paperHandlerStatusToEvent(getPaperInRearStatus())).toEqual({
      type: 'PAPER_IN_OUTPUT',
    });
  });
});

describe('PAT device', () => {
  // Get into the state at the start of a voter session.
  test('HID adapter support', async () => {
    await executeLoadPaper();
    vi.mocked(HID.devices).mockReturnValue([
      {
        productId: ORIGIN_SWIFTY_PRODUCT_ID,
        vendorId: ORIGIN_VENDOR_ID,
        release: 0.1,
        interface: 1,
        path: 'path/to/device',
      },
    ]);

    clock.increment(delays.DELAY_PAT_CONNECTION_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('pat_device_connected');
    vi.mocked(HID.devices).mockClear();
  });

  test('successful connection flow', async () => {
    await executeLoadPaper();
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);

    vi.mocked(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      true
    );
    clock.increment(delays.DELAY_PAT_CONNECTION_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('pat_device_connected');

    machine.setPatDeviceIsCalibrated();
    // Should return to last state in history, not initial state
    await waitForStatus('waiting_for_ballot_data');
  });

  test('isPatDeviceConnected', async () => {
    await executeLoadPaper();
    expect(machine.isPatDeviceConnected()).toEqual(false);
    vi.mocked(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      true
    );
    clock.increment(delays.DELAY_PAT_CONNECTION_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('pat_device_connected');
    expect(machine.isPatDeviceConnected()).toEqual(true);
  });

  test('connecting PAT device while on pollworker screen', async () => {
    mockPollWorkerAuth(auth, electionGeneralDefinition);
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);

    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
    await waitForStatus('accepting_paper');

    expect(machine.isPatDeviceConnected()).toEqual(false);
    vi.mocked(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      true
    );
    // PAT event should be ignored for non-voter states
    clock.increment(delays.DELAY_PAT_CONNECTION_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('accepting_paper');

    // Finish loading paper flow
    await executeLoadPaper({ noVoterAuth: true });
    expect(machine.getSimpleStatus()).toEqual('waiting_for_voter_auth');

    // Change to voter auth to see state change to pat_device_connected
    mockCardlessVoterAuth(auth);
    clock.increment(
      // Both auth and PAT connection status need to be updated
      Math.max(
        delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS,
        delays.DELAY_PAT_CONNECTION_STATUS_POLLING_INTERVAL_MS
      )
    );
    await waitForStatus('pat_device_connected');
    expect(machine.isPatDeviceConnected()).toEqual(true);
  });

  test('disconnecting PAT device during calibration', async () => {
    await executeLoadPaper();

    vi.mocked(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      true
    );
    clock.increment(delays.DELAY_PAT_CONNECTION_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('pat_device_connected');

    vi.mocked(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      false
    );
    clock.increment(delays.DELAY_PAT_CONNECTION_STATUS_POLLING_INTERVAL_MS);
    // Should return to last state in history, not initial state
    await waitForStatus('waiting_for_ballot_data');
  });
});

test('ending poll worker auth in accepting_paper returns to initial state', async () => {
  machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
  const ballotStyle = electionGeneralDefinition.election.ballotStyles[1];
  mockCardlessVoterAuth(auth, {
    ballotStyleId: ballotStyle.id,
    precinctId,
  });
  clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
  await waitForStatus('not_accepting_paper');
});

describe('poll_worker_auth_ended_unexpectedly', () => {
  beforeEach(() => {
    mockPollWorkerAuth(auth, electionGeneralDefinition);
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
  });

  test('loading_paper state', async () => {
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
    const ballotStyle = electionGeneralDefinition.election.ballotStyles[1];
    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    mockCardlessVoterAuth(auth, {
      ballotStyleId: ballotStyle.id,
      precinctId,
    });
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('poll_worker_auth_ended_unexpectedly');
  });

  test('loading_new_sheet state', async () => {
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
    await waitForStatus('accepting_paper');

    vi.spyOn(driver, 'loadPaper').mockImplementation(() => {
      mockCardlessVoterAuth(auth, {
        ballotStyleId: '1_en' as BallotStyleId,
        precinctId,
      });

      return Promise.resolve(true);
    });

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('poll_worker_auth_ended_unexpectedly');
  });

  test('validating_new_sheet state', async () => {
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
    await waitForStatus('accepting_paper');

    const deferredScan = deferred<string>();
    vi.mocked(scanAndSave).mockImplementation(() => {
      mockCardlessVoterAuth(auth, {
        ballotStyleId: '1_en' as BallotStyleId,
        precinctId,
      });

      return deferredScan.promise;
    });

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('validating_new_sheet');
    // Give the state machine time to poll and see the mock cardless voter auth
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('poll_worker_auth_ended_unexpectedly');

    // Clean up hanging promise:
    deferredScan.resolve(await writeTmpBlankImage());
  });

  test('inserted_invalid_new_sheet state', async () => {
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
    await waitForStatus('accepting_paper');

    vi.mocked(scanAndSave).mockResolvedValue(await writeTmpBlankImage());

    const interpretationType: PageInterpretationType = 'InvalidBallotHashPage';
    vi.mocked(interpretSimplexBmdBallot).mockResolvedValue([
      {
        interpretation: { type: interpretationType },
      } as unknown as InterpretFileResult,
      BLANK_PAGE_MOCK,
    ]);

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('inserted_invalid_new_sheet');

    mockCardlessVoterAuth(auth, {
      ballotStyleId: '1_en' as BallotStyleId,
      precinctId,
    });
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('poll_worker_auth_ended_unexpectedly');
  });

  test('inserted_preprinted_ballot state', async () => {
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
    await waitForStatus('accepting_paper');

    vi.mocked(scanAndSave).mockResolvedValue(await writeTmpBlankImage());
    vi.mocked(interpretSimplexBmdBallot).mockResolvedValue(
      SUCCESSFUL_INTERPRETATION_MOCK
    );

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('inserted_preprinted_ballot');

    mockCardlessVoterAuth(auth, {
      ballotStyleId: '1_en' as BallotStyleId,
      precinctId,
    });
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('poll_worker_auth_ended_unexpectedly');
  });
});

describe('paper handler diagnostic', () => {
  test('system admin log out', async () => {
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    mockSystemAdminAuth(auth);
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_TIMEOUT_MS);
    machine.startPaperHandlerDiagnostic();
    await waitForStatus('paper_handler_diagnostic.prompt_for_paper');

    mockLoggedOutAuth(auth);
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_TIMEOUT_MS);
    // Eventual blocking end state. Non-blocking intermediate states are difficult to
    // listen for.
    await waitForStatus('not_accepting_paper');
  });
});

test('reset() API', async () => {
  await executePrintBallotAndAssert(
    ballotPdfData,
    scannedBallotFixtureFilepaths,
    SUCCESSFUL_INTERPRETATION_MOCK
  );

  await waitForStatus('presenting_ballot');
  expect(machine.getInterpretation()).toEqual(SUCCESSFUL_INTERPRETATION_MOCK);

  machine.reset();

  await waitForStatus('not_accepting_paper');
  expect(machine.getInterpretation()).toBeUndefined();
});

test('insert and validate new blank sheet', async () => {
  mockPollWorkerAuth(auth, electionGeneralDefinition);
  clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);

  machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
  expect(machine.getSimpleStatus()).toEqual('accepting_paper');

  const mockInterpretResult = deferred<SheetOf<InterpretFileResult>>();
  vi.mocked(interpretSimplexBmdBallot).mockReturnValue(
    mockInterpretResult.promise
  );
  vi.mocked(scanAndSave).mockResolvedValue(await writeTmpBlankImage());

  await setMockStatusAndIncrementClock('paperInserted');
  await waitForStatus('loading_new_sheet');
  clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
  await waitForStatus('validating_new_sheet');

  mockInterpretResult.resolve(BLANK_PAGE_INTERPRETATION_MOCK);

  await waitForStatus('waiting_for_voter_auth');
  mockCardlessVoterAuth(auth);
  clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
  await waitForStatus('waiting_for_ballot_data');

  const {
    calls: [[frontImage]],
  } = vi.mocked(interpretSimplexBmdBallot).mock;
  assert(frontImage, 'No front image was passed to interpretSimplexBmdBallot');

  await expect(frontImage).toMatchImage(BLANK_PAGE_IMAGE_DATA);
});

describe('insert pre-printed ballot', () => {
  beforeEach(() => {
    mockPollWorkerAuth(auth, electionGeneralDefinition);
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
  });

  test('start session with valid pre-printed ballot', async () => {
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);

    vi.mocked(scanAndSave).mockResolvedValue(await writeTmpBlankImage());
    vi.mocked(interpretSimplexBmdBallot).mockResolvedValue(
      SUCCESSFUL_INTERPRETATION_MOCK
    );

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('inserted_preprinted_ballot');

    machine.startSessionWithPreprintedBallot();
    await waitForStatus('presenting_ballot');
  });

  test('return valid pre-printed ballot', async () => {
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);

    vi.mocked(scanAndSave).mockResolvedValue(await writeTmpBlankImage());
    vi.mocked(interpretSimplexBmdBallot).mockResolvedValue(
      SUCCESSFUL_INTERPRETATION_MOCK
    );

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('inserted_preprinted_ballot');

    const ejectSpy = vi.spyOn(driver, 'ejectPaperToFront');

    machine.returnPreprintedBallot();

    await waitForStatus('not_accepting_paper');
    expect(ejectSpy).toHaveBeenCalled();
  });

  const invalidInterpretationTypes: Record<PageInterpretationType, boolean> = {
    BlankPage: false,
    InterpretedBmdPage: false,

    InterpretedHmpbPage: true,
    InvalidBallotHashPage: true,
    InvalidTestModePage: true,
    InvalidPrecinctPage: true,
    UnreadablePage: true,
  };

  test.each(
    iter(Object.entries(invalidInterpretationTypes))
      .filterMap(([type, enabled]) => (enabled ? type : undefined))
      .toArray()
  )('insert invalid sheet: %s', async (interpretationType) => {
    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    vi.mocked(scanAndSave).mockResolvedValue(await writeTmpBlankImage());

    const mockInterpretResult = deferred<SheetOf<InterpretFileResult>>();
    vi.mocked(interpretSimplexBmdBallot).mockReturnValue(
      mockInterpretResult.promise
    );

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('validating_new_sheet');

    mockInterpretResult.resolve([
      {
        interpretation: { type: interpretationType },
      } as unknown as InterpretFileResult,
      BLANK_PAGE_MOCK,
    ]);
    await waitForStatus('inserted_invalid_new_sheet');
    expectMockPaperHandlerStatus(driver, 'presentingPaper');

    // Simulate removing the rejected sheet:
    await setMockStatusAndIncrementClock('noPaper');
    await waitForStatus('accepting_paper');
  });

  test('insert blank sheet when accepting only pre-printed ballots', async () => {
    machine.setAcceptingPaper(['InterpretedBmdPage']);
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    vi.mocked(scanAndSave).mockResolvedValue(await writeTmpBlankImage());

    vi.mocked(interpretSimplexBmdBallot).mockResolvedValue(
      BLANK_PAGE_INTERPRETATION_MOCK
    );

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('inserted_invalid_new_sheet');
  });
});

describe('re-insert removed ballot', () => {
  beforeEach(() => {
    mockPollWorkerAuth(auth, electionGeneralDefinition);
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);
  });

  /**
   * Mocks inserting, removing, and re-inserting a preprinted ballot.
   * Returns a deferred promise that can be resolved or rejected by
   * the caller to simulate the result of interpretation.
   */
  async function prepareBallotReinsertion(): Promise<
    Deferred<SheetOf<InterpretFileResult>>
  > {
    //
    // 1. [Setup] Seed voting session with pre-printed ballot:
    //

    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);

    vi.mocked(scanAndSave).mockResolvedValue(await writeTmpBlankImage());
    vi.mocked(interpretSimplexBmdBallot).mockResolvedValue(
      SUCCESSFUL_INTERPRETATION_MOCK
    );

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('inserted_preprinted_ballot');

    machine.startSessionWithPreprintedBallot();
    await waitForStatus('presenting_ballot');

    //
    // 2. Remove ballot during presentation/review:
    //

    await setMockStatusAndIncrementClock('noPaper');
    await waitForStatus('waiting_for_ballot_reinsertion');

    //
    // 3. Re-insert valid ballot:
    //

    const mockInterpretResult = deferred<SheetOf<InterpretFileResult>>();
    vi.mocked(interpretSimplexBmdBallot).mockReturnValue(
      mockInterpretResult.promise
    );
    const ballotImagePath = await writeTmpBlankImage();
    vi.mocked(scanAndSave).mockResolvedValue(ballotImagePath);

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_reinserted_ballot');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('validating_reinserted_ballot');

    return mockInterpretResult;
  }

  test('re-insert valid ballot', async () => {
    const mockInterpretResult = await prepareBallotReinsertion();

    mockInterpretResult.resolve(SUCCESSFUL_INTERPRETATION_MOCK);
    await waitForStatus('presenting_ballot');
    const {
      calls: [[frontImage]],
    } = vi.mocked(interpretSimplexBmdBallot).mock;

    await expect(frontImage).toMatchImage(BLANK_PAGE_IMAGE_DATA);
  });

  test('error during interpretation of ballot re-insert', async () => {
    const mockInterpretResult = await prepareBallotReinsertion();

    mockInterpretResult.reject(
      new Error('Test error in interpretation during ballot re-insert flow')
    );
    await waitForStatus('unrecoverable_error');
  });

  const invalidInterpretationTypes: Record<PageInterpretationType, boolean> = {
    InterpretedBmdPage: false,

    BlankPage: true,
    InterpretedHmpbPage: true,
    InvalidBallotHashPage: true,
    InvalidTestModePage: true,
    InvalidPrecinctPage: true,
    UnreadablePage: true,
  };

  test.each(
    iter(Object.entries(invalidInterpretationTypes))
      .filterMap(([type, enabled]) => (enabled ? type : undefined))
      .toArray()
  )(`reinsert invalid ballot: %s`, async (interpretationType) => {
    //
    // 1. [Setup] Seed voting session with pre-printed ballot:
    //

    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);

    vi.mocked(scanAndSave).mockResolvedValue(await writeTmpBlankImage());
    vi.mocked(interpretSimplexBmdBallot).mockResolvedValue(
      SUCCESSFUL_INTERPRETATION_MOCK
    );

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('inserted_preprinted_ballot');

    machine.startSessionWithPreprintedBallot();
    await waitForStatus('presenting_ballot');

    //
    // 2. Remove ballot during presentation/review:
    //

    await setMockStatusAndIncrementClock('noPaper');
    await waitForStatus('waiting_for_ballot_reinsertion');

    //
    // 3. Re-insert invalid ballot:
    //

    const mockInterpretResult = deferred<SheetOf<InterpretFileResult>>();
    vi.mocked(interpretSimplexBmdBallot).mockReturnValue(
      mockInterpretResult.promise
    );

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_reinserted_ballot');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('validating_reinserted_ballot');

    mockInterpretResult.resolve([
      {
        interpretation: { type: interpretationType },
      } as unknown as InterpretFileResult,
      BLANK_PAGE_MOCK,
    ]);
    await waitForStatus('reinserted_invalid_ballot');
    expectMockPaperHandlerStatus(driver, 'presentingPaper');

    //
    // 4. Remove invalid ballot:
    //

    await setMockStatusAndIncrementClock('noPaper');
    await waitForStatus('waiting_for_ballot_reinsertion');
  });
});

describe('open cover detection', () => {
  beforeEach(async () => {
    // Restore the original `loadAndParkPaper`, so it calls the underlying
    // mock paper handler.
    vi.mocked(loadAndParkPaper).mockImplementation(
      (
        await vi.importActual<typeof import('./application_driver')>(
          './application_driver'
        )
      ).loadAndParkPaper
    );

    vi.mocked(setAudioOutput).mockResolvedValue();
  });

  test("doesn't trigger when polls are not open", async () => {
    workspace.store.setPollsState('polls_closed_initial');
    mockLoggedOutAuth(auth);
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');

    await setMockCoverOpen(true);
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');

    // No alarm for Poll Worker:
    mockPollWorkerAuth(auth, electionGeneralDefinition);
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await sleep(0);
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');

    // No alarm for EM:
    mockElectionManagerAuth(auth, electionGeneralDefinition);
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await sleep(0);
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');

    // No alarm for SA:
    mockSystemAdminAuth(auth);
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await sleep(0);
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');

    expect(vi.mocked(setAudioOutput)).not.toHaveBeenCalled();
  });

  test('triggers when logged out and polls are open', async () => {
    workspace.store.setPollsState('polls_open');
    mockLoggedOutAuth(auth);
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');

    await setMockCoverOpen(true);
    expect(machine.getSimpleStatus()).toEqual('cover_open_unauthorized');
    expect(vi.mocked(setAudioOutput)).toHaveBeenLastCalledWith(
      AudioOutput.SPEAKER,
      expect.anything() // logger
    );

    // Stops triggering for Poll Worker:
    mockPollWorkerAuth(auth, electionGeneralDefinition);
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await sleep(0);
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    expect(vi.mocked(setAudioOutput)).toHaveBeenLastCalledWith(
      AudioOutput.HEADPHONES,
      expect.anything() // logger
    );

    // Stops triggering for EM:
    mockElectionManagerAuth(auth, electionGeneralDefinition);
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await sleep(0);
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');

    // Stops triggering for SA:
    mockSystemAdminAuth(auth);
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await sleep(0);
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');

    // Triggers again once logged out:
    mockLoggedOutAuth(auth);
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await sleep(0);
    expect(machine.getSimpleStatus()).toEqual('cover_open_unauthorized');
    expect(vi.mocked(setAudioOutput)).toHaveBeenLastCalledWith(
      AudioOutput.SPEAKER,
      expect.anything() // logger
    );

    // Close cover to stop triggering:
    await setMockCoverOpen(false);
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    expect(vi.mocked(setAudioOutput)).toHaveBeenLastCalledWith(
      AudioOutput.HEADPHONES,
      expect.anything() // logger
    );
  });

  test('triggers when logged in as voter', async () => {
    workspace.store.setPollsState('polls_open');
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    mockLoggedOutAuth(auth);

    await executeLoadPaper();

    await setMockCoverOpen(true);
    expect(machine.getSimpleStatus()).toEqual('cover_open_unauthorized');
  });
});

describe('unrecoverable_error', () => {
  beforeEach(() => {
    vi.mocked(interpretSimplexBmdBallot).mockImplementation(() => {
      throw new Error('Test error interpreting BMD ballot');
    });
  });

  test('triggers when an error occurs during voting_flow.validating_new_sheet', async () => {
    mockPollWorkerAuth(auth, electionGeneralDefinition);
    clock.increment(delays.DELAY_AUTH_STATUS_POLLING_INTERVAL_MS);

    machine.setAcceptingPaper(ACCEPTED_PAPER_TYPES);
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    const mockInterpretResult = deferred<SheetOf<InterpretFileResult>>();
    vi.mocked(interpretSimplexBmdBallot).mockReturnValue(
      mockInterpretResult.promise
    );
    vi.mocked(scanAndSave).mockResolvedValue(await writeTmpBlankImage());

    await setMockStatusAndIncrementClock('paperInserted');
    await waitForStatus('loading_new_sheet');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('validating_new_sheet');

    mockInterpretResult.reject(new Error('Test interpretation error'));
    await waitForStatus('unrecoverable_error');
  });

  test('triggers when an error occurs during voting_flow.printing', async () => {
    await executeLoadPaper();

    const printResult = deferred<void>();
    vi.mocked(printBallotChunks).mockReturnValue(printResult.promise);

    void machine.printBallot(Buffer.of());
    await waitForStatus('printing_ballot');
    expect(printBallotChunks).toHaveBeenCalledTimes(1);

    printResult.reject(new Error('Test print error'));
    await waitForStatus('unrecoverable_error');
  });

  test('triggers when an error occurs during voting_flow.scanning', async () => {
    await executeLoadPaper();

    vi.mocked(scanAndSave).mockReset();
    vi.mocked(interpretSimplexBmdBallot).mockReset();
    vi.mocked(printBallotChunks).mockResolvedValue();

    const mockScanResult = deferred<string>();
    vi.mocked(scanAndSave).mockReturnValue(mockScanResult.promise);

    const mockInterpretResult = deferred<SheetOf<InterpretFileResult>>();
    vi.mocked(interpretSimplexBmdBallot).mockReturnValue(
      mockInterpretResult.promise
    );

    void machine.printBallot(Buffer.of());
    await waitForStatus('printing_ballot');
    expect(printBallotChunks).toHaveBeenCalledTimes(1);

    await waitForStatus('scanning');
    expect(scanAndSave).toBeCalledTimes(1);

    mockScanResult.reject(new Error('Test interpretation error'));
    await waitForStatus('unrecoverable_error');
  });

  test('triggers when an error occurs during voting_flow.interpreting', async () => {
    await executeLoadPaper();

    vi.mocked(scanAndSave).mockReset();
    vi.mocked(interpretSimplexBmdBallot).mockReset();
    vi.mocked(printBallotChunks).mockResolvedValue();

    const mockScanResult = deferred<string>();
    vi.mocked(scanAndSave).mockReturnValue(mockScanResult.promise);

    const mockInterpretResult = deferred<SheetOf<InterpretFileResult>>();
    vi.mocked(interpretSimplexBmdBallot).mockReturnValue(
      mockInterpretResult.promise
    );

    void machine.printBallot(ballotPdfData);
    await waitForStatus('printing_ballot');
    expect(printBallotChunks).toHaveBeenCalledTimes(1);

    await waitForStatus('scanning');
    expect(scanAndSave).toBeCalledTimes(1);

    mockScanResult.resolve(scannedBallotFixtureFilepaths);
    await waitForStatus('interpreting');

    mockInterpretResult.reject(new Error('Test error in interpretation'));

    expect(interpretSimplexBmdBallot).toHaveBeenCalledTimes(1);
    await waitForStatus('unrecoverable_error');
  });
});
