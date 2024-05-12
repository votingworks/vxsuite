import HID from 'node-hid';
import {
  PaperHandlerDriver,
  MinimalWebUsbDevice,
  PaperHandlerStatus,
} from '@votingworks/custom-paper-handler';
import { Buffer } from 'buffer';
import { dirSync } from 'tmp';
import { LogEventId, BaseLogger, mockBaseLogger } from '@votingworks/logging';
import {
  InsertedSmartCardAuthApi,
  buildMockInsertedSmartCardAuth,
} from '@votingworks/auth';
import { advanceTimers, mockOf } from '@votingworks/test-utils';
import { deferred } from '@votingworks/basics';
import {
  electionGeneralDefinition,
  electionGridLayoutNewHampshireHudsonFixtures,
  systemSettings,
} from '@votingworks/fixtures';
import {
  BallotId,
  BallotType,
  SheetOf,
  TEST_JURISDICTION,
  safeParseSystemSettings,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { assert } from 'console';
import {
  InterpretFileResult,
  interpretSimplexBmdBallotFromFilepath,
} from '@votingworks/ballot-interpreter';
import { fromGrayScale, writeImageData } from '@votingworks/image-utils';
import { join } from 'path';
import { ImageData } from 'canvas';
import {
  PaperHandlerStateMachine,
  getPaperHandlerStateMachine,
  paperHandlerStatusToEvent,
} from './state_machine';
import { Workspace, createWorkspace } from '../util/workspace';
import {
  PatConnectionStatusReader,
  PatConnectionStatusReaderInterface,
} from '../pat-input/connection_status_reader';
import {
  getDefaultPaperHandlerStatus,
  getJammedButNoPaperStatus,
  getPaperInFrontStatus,
  getPaperInRearStatus,
  getPaperInsideStatus,
  getPaperJammedStatus,
  getPaperParkedStatus,
  readBallotFixture,
} from './test_utils';
import { SimpleServerStatus } from '.';
import {
  printBallotChunks,
  resetAndReconnect,
  scanAndSave,
} from './application_driver';
import { getSampleBallotFilepath } from './filepaths';
import {
  mockCardlessVoterAuth,
  mockPollWorkerAuth,
} from '../../test/auth_helpers';
import { MAX_BALLOT_BOX_CAPACITY } from './constants';
import {
  ORIGIN_SWIFTY_PRODUCT_ID,
  ORIGIN_VENDOR_ID,
} from '../pat-input/constants';

// Use shorter polling interval in tests to reduce run times
const TEST_POLL_INTERVAL_MS = 50;
// Must be longer than backendWaitForInterval or tests can't
// detect `ballot_accepted` state
const TEST_NOTIFICATION_DURATION_MS = 150;

jest.mock('@votingworks/custom-paper-handler');
jest.mock('@votingworks/ballot-interpreter');
jest.mock('./application_driver');
jest.mock('../pat-input/connection_status_reader');
jest.mock('node-hid');

let driver: PaperHandlerDriver;
let workspace: Workspace;
let machine: PaperHandlerStateMachine;
let logger: BaseLogger;
let patConnectionStatusReader: PatConnectionStatusReaderInterface;
let auth: InsertedSmartCardAuthApi;

const webDevice: MinimalWebUsbDevice = {
  open: jest.fn(),
  close: jest.fn(),
  transferOut: jest.fn(),
  transferIn: jest.fn(),
  claimInterface: jest.fn(),
  selectConfiguration: jest.fn(),
};

const precinctId = electionGeneralDefinition.election.precincts[1].id;
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

const MOCK_IMAGE: ImageData = {
  colorSpace: 'srgb',
  data: new Uint8ClampedArray(),
  height: 0,
  width: 0,
} as const;

const BLANK_PAGE_MOCK: InterpretFileResult = {
  interpretation: { type: 'BlankPage' },
  normalizedImage: MOCK_IMAGE,
};

const BLANK_PAGE_INTERPRETATION_MOCK: SheetOf<InterpretFileResult> = [
  BLANK_PAGE_MOCK,
  BLANK_PAGE_MOCK,
];

const SUCCESSFUL_INTERPRETATION_MOCK: SheetOf<InterpretFileResult> = [
  {
    interpretation: {
      type: 'InterpretedBmdPage',
      ballotId: '1_en' as BallotId,
      metadata: {
        electionHash: 'hash',
        ballotType: BallotType.Precinct,
        ballotStyleId: '5',
        precinctId: '21',
        isTestMode: true,
      },
      votes: {},
    },
    normalizedImage: MOCK_IMAGE,
  },
  BLANK_PAGE_MOCK,
];

async function advanceMockTimersAndPromises(milliseconds = 1000) {
  advanceTimers(milliseconds / 1000);
  await Promise.resolve();
}

async function waitForTransition() {
  const { promise, resolve } = deferred<void>();

  machine.addTransitionListener(resolve);

  return promise;
}

function expectCurrentStatus(status: SimpleServerStatus) {
  expect(machine.getSimpleStatus()).toEqual(status);
}

async function expectStatusTransitionTo(
  status: SimpleServerStatus,
  waitTimeMs?: number
) {
  await advanceMockTimersAndPromises(waitTimeMs);
  await waitForTransition();

  expectCurrentStatus(status);
}

beforeEach(async () => {
  jest.useFakeTimers();

  logger = mockBaseLogger();
  auth = buildMockInsertedSmartCardAuth();
  workspace = createWorkspace(dirSync().name);
  workspace.store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
  });
  workspace.store.setPrecinctSelection(singlePrecinctSelectionFor(precinctId));
  workspace.store.setSystemSettings(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  driver = new PaperHandlerDriver(webDevice);

  patConnectionStatusReader = new PatConnectionStatusReader(logger);
  mockOf(patConnectionStatusReader.open).mockResolvedValue(true);
  mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
    false
  );

  mockOf(HID.devices).mockReturnValue([]);

  jest
    .spyOn(driver, 'syncScannerConfig')
    .mockImplementation(() => Promise.resolve(false));
  jest
    .spyOn(driver, 'getPaperHandlerStatus')
    .mockImplementation(() => Promise.resolve(getDefaultPaperHandlerStatus()));

  machine = (await getPaperHandlerStateMachine({
    workspace,
    auth,
    logger,
    driver,
    patConnectionStatusReader,
    devicePollingIntervalMs: TEST_POLL_INTERVAL_MS,
    authPollingIntervalMs: TEST_POLL_INTERVAL_MS,
    notificationDurationMs: TEST_NOTIFICATION_DURATION_MS,
  })) as PaperHandlerStateMachine;
});

afterEach(async () => {
  featureFlagMock.resetFeatureFlags();
  await machine.cleanUp();
  jest.resetAllMocks();
});

function setMockDeviceStatus(status: PaperHandlerStatus) {
  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(status);
}

describe('not_accepting_paper', () => {
  it('transitions to accepting_paper state on BEGIN_ACCEPTING_PAPER event', () => {
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    machine.setAcceptingPaper();
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');
  });

  it('ejects paper to front when paper is parked', async () => {
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    setMockDeviceStatus(getPaperParkedStatus());
    await expectStatusTransitionTo('ejecting_to_front');
  });

  it('ejects paper to front when paper is inside but not parked', async () => {
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    setMockDeviceStatus(getPaperInsideStatus());
    await expectStatusTransitionTo('ejecting_to_front');
  });
});

describe('accepting_paper', () => {
  it('transitions to loading_paper state when front sensors are triggered', async () => {
    machine.setAcceptingPaper();
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    setMockDeviceStatus(getPaperInFrontStatus());
    await expectStatusTransitionTo('loading_paper');
  });

  it('transitions to waiting_for_ballot_data state when paper is already parked', async () => {
    machine.setAcceptingPaper();
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    setMockDeviceStatus(getPaperParkedStatus());
    await expectStatusTransitionTo('waiting_for_ballot_data');
  });
});

describe('loading_paper', () => {
  it('calls load and park functions on driver', async () => {
    machine.setAcceptingPaper();
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    setMockDeviceStatus(getPaperInFrontStatus());
    await expectStatusTransitionTo('loading_paper');
  });

  it('transitions to waiting_for_ballot_data state when paper is already parked', async () => {
    machine.setAcceptingPaper();
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    setMockDeviceStatus(getPaperParkedStatus());
    await expectStatusTransitionTo('waiting_for_ballot_data');
  });
});

describe('paper jam', () => {
  it('during voter session - logged out', async () => {
    const resetDriverResult = deferred<PaperHandlerDriver>();
    mockOf(resetAndReconnect).mockImplementation(async () => {
      return resetDriverResult.promise;
    });

    mockOf(auth.getAuthStatus).mockResolvedValue({
      status: 'logged_out',
      reason: 'no_card',
    });

    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');

    setMockDeviceStatus(getPaperJammedStatus());
    await expectStatusTransitionTo('jammed');

    setMockDeviceStatus(getDefaultPaperHandlerStatus());
    await expectStatusTransitionTo('jam_cleared');

    resetDriverResult.resolve(driver);
    await expectStatusTransitionTo('resetting_state_machine_after_jam');

    await expectStatusTransitionTo('paper_reloaded');
    await expectStatusTransitionTo('not_accepting_paper');
  });

  it('during voter session - with poll worker auth', async () => {
    const resetDriverResult = deferred<PaperHandlerDriver>();
    mockOf(resetAndReconnect).mockImplementation(async () => {
      return resetDriverResult.promise;
    });

    mockCardlessVoterAuth(auth);

    setMockDeviceStatus(getPaperJammedStatus());
    await expectStatusTransitionTo('jammed');

    mockPollWorkerAuth(auth, electionGeneralDefinition);

    setMockDeviceStatus(getDefaultPaperHandlerStatus());
    await expectStatusTransitionTo('jam_cleared');

    setMockDeviceStatus(getDefaultPaperHandlerStatus());

    resetDriverResult.resolve(driver);
    await expectStatusTransitionTo('resetting_state_machine_after_jam');

    await expectStatusTransitionTo('accepting_paper_after_jam');

    jest.spyOn(driver, 'parkPaper').mockImplementation(() => {
      setMockDeviceStatus(getPaperParkedStatus());
      return Promise.resolve(true);
    });

    setMockDeviceStatus(getPaperInFrontStatus());
    await expectStatusTransitionTo('loading_paper_after_jam');
    await expectStatusTransitionTo('paper_reloaded');
    expect(driver.loadPaper).toHaveBeenCalledTimes(1);
    expect(driver.parkPaper).toHaveBeenCalledTimes(1);
  });

  it('during voter session - with cardless voter auth', async () => {
    const resetDriverResult = deferred<PaperHandlerDriver>();
    mockOf(resetAndReconnect).mockImplementation(async () => {
      return resetDriverResult.promise;
    });

    mockCardlessVoterAuth(auth);

    setMockDeviceStatus(getPaperJammedStatus());
    await expectStatusTransitionTo('jammed');

    setMockDeviceStatus(getDefaultPaperHandlerStatus());
    await expectStatusTransitionTo('jam_cleared');

    setMockDeviceStatus(getDefaultPaperHandlerStatus());

    resetDriverResult.resolve(driver);
    await expectStatusTransitionTo('resetting_state_machine_after_jam');

    await expectStatusTransitionTo('accepting_paper_after_jam');

    jest.spyOn(driver, 'parkPaper').mockImplementation(() => {
      setMockDeviceStatus(getPaperParkedStatus());
      return Promise.resolve(true);
    });

    setMockDeviceStatus(getPaperInFrontStatus());
    await expectStatusTransitionTo('loading_paper_after_jam');
    await expectStatusTransitionTo('paper_reloaded');
    expect(driver.loadPaper).toHaveBeenCalledTimes(1);
    expect(driver.parkPaper).toHaveBeenCalledTimes(1);
  });

  it('jam_cleared triggered for JAMMED_STATUS_NO_PAPER event', async () => {
    setMockDeviceStatus(getPaperJammedStatus());
    await expectStatusTransitionTo('jammed');

    setMockDeviceStatus(getJammedButNoPaperStatus());
    await expectStatusTransitionTo('jam_cleared');
  });
});

// Sets up print and scan mocks. Executes the state machine from 'not_accepting_paper' to 'presenting_ballot'.
async function executePrintBallotAndAssert(
  ballotPdfData: Buffer,
  scanFixtureFilepath: string,
  interpretationResult: SheetOf<InterpretFileResult> = SUCCESSFUL_INTERPRETATION_MOCK
): Promise<void> {
  mockOf(printBallotChunks).mockResolvedValue();

  const mockScanResult = deferred<string>();
  mockOf(scanAndSave).mockResolvedValue(mockScanResult.promise);

  const mockInterpretResult = deferred<SheetOf<InterpretFileResult>>();
  mockOf(interpretSimplexBmdBallotFromFilepath).mockResolvedValue(
    mockInterpretResult.promise
  );

  machine.setAcceptingPaper();
  setMockDeviceStatus(getPaperParkedStatus());
  await expectStatusTransitionTo('waiting_for_ballot_data');

  void machine.printBallot(ballotPdfData);
  expectCurrentStatus('printing_ballot');
  expect(printBallotChunks).toHaveBeenCalledTimes(1);

  await expectStatusTransitionTo('scanning');
  expect(scanAndSave).toBeCalledTimes(1);

  mockScanResult.resolve(scanFixtureFilepath);
  await expectStatusTransitionTo('interpreting');

  mockInterpretResult.resolve(interpretationResult);
  expect(mockOf(interpretSimplexBmdBallotFromFilepath)).toHaveBeenCalledWith(
    scanFixtureFilepath,
    expect.objectContaining({})
  );
}

test('voting flow happy path', async () => {
  // This test asserts on blocking states only. Non-blocking
  // states are hard to reliably assert on
  const ballotPdfData = await readBallotFixture();
  const scannedBallotFixtureFilepaths = getSampleBallotFilepath();
  await executePrintBallotAndAssert(
    ballotPdfData,
    scannedBallotFixtureFilepaths
  );

  setMockDeviceStatus(getPaperInFrontStatus());
  await expectStatusTransitionTo('presenting_ballot');
  expect(driver.presentPaper).toHaveBeenCalledTimes(1);

  machine.validateBallot();
  setMockDeviceStatus(getPaperInRearStatus());
  await expectStatusTransitionTo('ejecting_to_rear');

  expect(workspace.store.getBallotsCastSinceLastBoxChange()).toEqual(0);
  setMockDeviceStatus(getDefaultPaperHandlerStatus());
  await expectStatusTransitionTo('ballot_accepted');
  expect(workspace.store.getBallotsCastSinceLastBoxChange()).toEqual(1);

  await expectStatusTransitionTo('not_accepting_paper');
});

describe('removing ballot during presentation state', () => {
  test('goes to ballot_removed_during_presentation state', async () => {
    const ballotPdfData = await readBallotFixture();
    const scannedBallotFixtureFilepaths = getSampleBallotFilepath();
    await executePrintBallotAndAssert(
      ballotPdfData,
      scannedBallotFixtureFilepaths
    );

    setMockDeviceStatus(getPaperInFrontStatus());
    await expectStatusTransitionTo('presenting_ballot');

    setMockDeviceStatus(getDefaultPaperHandlerStatus());
    await expectStatusTransitionTo('ballot_removed_during_presentation');

    machine.confirmSessionEnd();
    await expectStatusTransitionTo('not_accepting_paper');
  });
});

test('ballot box empty flow', async () => {
  workspace.store.setBallotsCastSinceLastBoxChange(MAX_BALLOT_BOX_CAPACITY - 1);

  const ballotPdfData = await readBallotFixture();
  const scannedBallotFixtureFilepaths = getSampleBallotFilepath();
  await executePrintBallotAndAssert(
    ballotPdfData,
    scannedBallotFixtureFilepaths
  );

  setMockDeviceStatus(getPaperInFrontStatus());
  await expectStatusTransitionTo('presenting_ballot');
  expect(driver.presentPaper).toHaveBeenCalledTimes(1);

  machine.validateBallot();
  setMockDeviceStatus(getPaperInRearStatus());
  await expectStatusTransitionTo('ejecting_to_rear');

  setMockDeviceStatus(getDefaultPaperHandlerStatus());
  await expectStatusTransitionTo('ballot_accepted');
  expect(workspace.store.getBallotsCastSinceLastBoxChange()).toEqual(
    MAX_BALLOT_BOX_CAPACITY
  );

  await expectStatusTransitionTo('empty_ballot_box');

  machine.confirmBallotBoxEmptied();
  await expectStatusTransitionTo('not_accepting_paper');
});

test('elections with grid layouts still try to interpret BMD ballots', async () => {
  const { electionDefinition } = electionGridLayoutNewHampshireHudsonFixtures;

  workspace.store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
  });
  workspace.store.setPrecinctSelection(
    singlePrecinctSelectionFor(electionDefinition.election.precincts[0].id)
  );

  const ballotPdfData = await readBallotFixture();
  const scannedBallotFixtureFilepaths = getSampleBallotFilepath();
  await executePrintBallotAndAssert(
    ballotPdfData,
    scannedBallotFixtureFilepaths
  );
});

test('blank page interpretation', async () => {
  const blankImage = fromGrayScale(new Uint8ClampedArray([0]), 1, 1);
  const imageName = 'blank-image.jpg';
  const mockScannedBallotImagePath = join(dirSync().name, imageName);

  const ballotPdfData = await readBallotFixture();
  await writeImageData(mockScannedBallotImagePath, blankImage);

  await executePrintBallotAndAssert(
    ballotPdfData,
    mockScannedBallotImagePath,
    BLANK_PAGE_INTERPRETATION_MOCK
  );

  await expectStatusTransitionTo('blank_page_interpretation');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BlankInterpretation,
    'system'
  );
  expect(driver.presentPaper).toHaveBeenCalledTimes(1);

  // Remove blank ballot
  mockPollWorkerAuth(auth, electionGeneralDefinition);
  setMockDeviceStatus(getDefaultPaperHandlerStatus());
  await expectStatusTransitionTo('blank_page_interpretation');

  // Prepare to insert new sheet
  setMockDeviceStatus(getPaperInFrontStatus());
  await expectStatusTransitionTo('blank_page_interpretation');

  expect(driver.loadPaper).toHaveBeenCalledTimes(1);
  expect(driver.parkPaper).toHaveBeenCalledTimes(1);
  setMockDeviceStatus(getPaperParkedStatus());

  await expectStatusTransitionTo('paper_reloaded');

  const ballotStyle = electionGeneralDefinition.election.ballotStyles[1];
  // The fixture expects ballot style id 5
  assert(ballotStyle.id === '5');

  mockCardlessVoterAuth(auth, {
    ballotStyleId: ballotStyle.id,
    precinctId,
  });
  await expectStatusTransitionTo('waiting_for_ballot_data');
});

test('cleanUp', async () => {
  await machine.cleanUp();
  expect(driver.disconnect).toHaveBeenCalledTimes(1);
});

test('getRawDeviceStatus', async () => {
  mockOf(driver.getPaperHandlerStatus).mockResolvedValue(
    getJammedButNoPaperStatus()
  );
  const rawStatus = await machine.getRawDeviceStatus();
  expect(rawStatus).toEqual(getJammedButNoPaperStatus());
  expect(driver.getPaperHandlerStatus).toHaveBeenCalledTimes(1);
});

describe('paperHandlerStatusToEvent', () => {
  test('PAPER_IN_OUTPUT', () => {
    expect(paperHandlerStatusToEvent(getPaperInRearStatus())).toEqual({
      type: 'PAPER_IN_OUTPUT',
    });
  });
});

describe('paper handler status observable', () => {
  test('logs if an error is thrown', async () => {
    mockOf(driver.getPaperHandlerStatus).mockRejectedValue(
      new Error('Test error')
    );
    await advanceMockTimersAndPromises();
    expect(logger.log).toHaveBeenCalledWith(LogEventId.UnknownError, 'system', {
      error: 'Test error',
    });
  });
});

describe('PAT device', () => {
  test('HID adapter support', async () => {
    mockOf(HID.devices).mockReturnValue([
      {
        productId: ORIGIN_SWIFTY_PRODUCT_ID,
        vendorId: ORIGIN_VENDOR_ID,
        release: 0.1,
        interface: 1,
        path: 'path/to/device',
      },
    ]);

    await expectStatusTransitionTo('pat_device_connected');
    mockOf(HID.devices).mockClear();
  });

  test('successful connection flow', async () => {
    machine.setAcceptingPaper();
    await expectStatusTransitionTo('accepting_paper');

    mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      true
    );
    await expectStatusTransitionTo('pat_device_connected');

    machine.setPatDeviceIsCalibrated();
    // Should return to last state in history, not initial state
    await expectStatusTransitionTo('accepting_paper');
  });

  test('isPatDeviceConnected', async () => {
    expect(machine.isPatDeviceConnected()).toEqual(false);
    mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      true
    );
    await expectStatusTransitionTo('pat_device_connected');
    expect(machine.isPatDeviceConnected()).toEqual(true);
  });

  test('disconnecting PAT device during calibration', async () => {
    machine.setAcceptingPaper();
    await expectStatusTransitionTo('accepting_paper');

    mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      true
    );
    await expectStatusTransitionTo('pat_device_connected');
    mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      false
    );

    // Should return to last state in history, not initial state
    await expectStatusTransitionTo('accepting_paper');
  });

  test('logs if an error is thrown when trying to read device connection status', async () => {
    const errorMessage = 'Test error in PAT';
    mockOf(patConnectionStatusReader.isPatDeviceConnected).mockRejectedValue(
      new Error(errorMessage)
    );
    await advanceMockTimersAndPromises();
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PatDeviceError,
      'system',
      {
        error: errorMessage,
      }
    );
  });
});

test('ending poll worker auth in accepting_paper returns to initial state', async () => {
  machine.setAcceptingPaper();
  const ballotStyle = electionGeneralDefinition.election.ballotStyles[1];
  mockCardlessVoterAuth(auth, {
    ballotStyleId: ballotStyle.id,
    precinctId,
  });
  await expectStatusTransitionTo('not_accepting_paper');
});

test('poll_worker_auth_ended_unexpectedly', async () => {
  machine.setAcceptingPaper();
  const ballotStyle = electionGeneralDefinition.election.ballotStyles[1];
  setMockDeviceStatus(getPaperInFrontStatus());
  await expectStatusTransitionTo('loading_paper');
  mockCardlessVoterAuth(auth, {
    ballotStyleId: ballotStyle.id,
    precinctId,
  });
  await expectStatusTransitionTo('poll_worker_auth_ended_unexpectedly');
});
