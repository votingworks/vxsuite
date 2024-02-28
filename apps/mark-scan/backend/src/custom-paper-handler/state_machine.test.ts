import HID from 'node-hid';
import {
  PaperHandlerDriver,
  MinimalWebUsbDevice,
  PaperHandlerStatus,
} from '@votingworks/custom-paper-handler';
import { Buffer } from 'buffer';
import { dirSync } from 'tmp';
import { LogEventId, Logger, fakeLogger } from '@votingworks/logging';
import {
  InsertedSmartCardAuthApi,
  buildMockInsertedSmartCardAuth,
} from '@votingworks/auth';
import waitForExpect from 'wait-for-expect';
import { mockOf } from '@votingworks/test-utils';
import { sleep } from '@votingworks/basics';
import {
  electionGeneralDefinition,
  systemSettings,
} from '@votingworks/fixtures';
import {
  SheetOf,
  TEST_JURISDICTION,
  safeParseSystemSettings,
} from '@votingworks/types';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { assert } from 'console';
import {
  PaperHandlerStateMachine,
  getPaperHandlerStateMachine,
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
import {
  getBlankSheetFixturePath,
  getSampleBallotFilepaths,
} from './filepaths';
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
waitForExpect.defaults.interval = 10;
const TEST_POLL_INTERVAL_MS = 500;
const TEST_NOTIFICATION_DURATION_MS = 1000;

jest.mock('@votingworks/custom-paper-handler');
jest.mock('./application_driver');
jest.mock('../pat-input/connection_status_reader');
jest.mock('node-hid');

let driver: PaperHandlerDriver;
let workspace: Workspace;
let machine: PaperHandlerStateMachine;
let logger: Logger;
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

beforeEach(async () => {
  logger = fakeLogger();
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
    authPollingIntervalMs: TEST_NOTIFICATION_DURATION_MS,
    notificationDurationMs: 1000,
  })) as PaperHandlerStateMachine;
});

afterEach(async () => {
  await machine.cleanUp();
  jest.resetAllMocks();
});

// Use to await an expected status after an operation that requires the
// state machine to poll an observable ie. raw paper handler status changes
// or auth changes
function waitForStatus(status: SimpleServerStatus): Promise<unknown> {
  return waitForExpect(() => {
    expect(machine.getSimpleStatus()).toEqual(status);
  });
}

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
    await waitForStatus('ejecting_to_front');
  });

  it('ejects paper to front when paper is inside but not parked', async () => {
    expect(machine.getSimpleStatus()).toEqual('not_accepting_paper');
    setMockDeviceStatus(getPaperInsideStatus());
    await waitForStatus('ejecting_to_front');
  });
});

describe('accepting_paper', () => {
  it('transitions to loading_paper state when front sensors are triggered', async () => {
    machine.setAcceptingPaper();
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    setMockDeviceStatus(getPaperInFrontStatus());
    await waitForStatus('loading_paper');
  });

  it('transitions to waiting_for_ballot_data state when paper is already parked', async () => {
    machine.setAcceptingPaper();
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    setMockDeviceStatus(getPaperParkedStatus());
    await waitForStatus('waiting_for_ballot_data');
  });
});

describe('loading_paper', () => {
  it('calls load and park functions on driver', async () => {
    machine.setAcceptingPaper();
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    setMockDeviceStatus(getPaperInFrontStatus());
    await waitForStatus('loading_paper');
  });

  it('transitions to waiting_for_ballot_data state when paper is already parked', async () => {
    machine.setAcceptingPaper();
    expect(machine.getSimpleStatus()).toEqual('accepting_paper');

    setMockDeviceStatus(getPaperParkedStatus());
    await waitForStatus('waiting_for_ballot_data');
  });
});

describe('paper jam', () => {
  it('handles jam state based on paper presence', async () => {
    mockOf(resetAndReconnect).mockImplementation(async () => {
      // Without this sleep the states will transition too quickly and we can't make
      // assertions for intermediate states
      await sleep(1);
      return Promise.resolve(driver);
    });

    setMockDeviceStatus(getPaperJammedStatus());
    await waitForStatus('jammed');

    setMockDeviceStatus(getJammedButNoPaperStatus());
    await waitForStatus('jam_cleared');

    setMockDeviceStatus(getDefaultPaperHandlerStatus());
    await waitForStatus('resetting_state_machine_after_jam');
  });
});

// Sets up print and scan mocks. Executes the state machine from 'not_accepting_paper' to 'presenting_ballot'.
async function executePrintBallotAndAssert(
  ballotPdfData: Buffer,
  scanFixtureFilepaths: SheetOf<string>
): Promise<void> {
  mockOf(printBallotChunks).mockImplementation(async () => {
    await sleep(TEST_POLL_INTERVAL_MS);
  });
  mockOf(scanAndSave).mockImplementation(async () => {
    await sleep(TEST_POLL_INTERVAL_MS);
    return scanFixtureFilepaths;
  });

  machine.setAcceptingPaper();
  setMockDeviceStatus(getPaperParkedStatus());
  await waitForStatus('waiting_for_ballot_data');

  machine.printBallot(ballotPdfData);
  await waitForStatus('printing_ballot');
  expect(printBallotChunks).toHaveBeenCalledTimes(1);

  await waitForStatus('interpreting');
  expect(scanAndSave).toBeCalledTimes(1);
}

test('voting flow happy path', async () => {
  // This test asserts on blocking states only. Non-blocking
  // states are hard to reliably assert on
  const ballotPdfData = await readBallotFixture();
  const scannedBallotFixtureFilepaths = getSampleBallotFilepaths();
  await executePrintBallotAndAssert(
    ballotPdfData,
    scannedBallotFixtureFilepaths
  );

  setMockDeviceStatus(getPaperInFrontStatus());
  await waitForStatus('presenting_ballot');
  expect(driver.presentPaper).toHaveBeenCalledTimes(1);

  machine.validateBallot();
  setMockDeviceStatus(getPaperInRearStatus());
  await waitForStatus('ejecting_to_rear');

  expect(workspace.store.getBallotsCastSinceLastBoxChange()).toEqual(0);
  setMockDeviceStatus(getDefaultPaperHandlerStatus());
  await waitForStatus('ballot_accepted');
  expect(workspace.store.getBallotsCastSinceLastBoxChange()).toEqual(1);

  await waitForStatus('not_accepting_paper');
});

test('ballot box empty flow', async () => {
  workspace.store.setBallotsCastSinceLastBoxChange(MAX_BALLOT_BOX_CAPACITY - 1);

  const ballotPdfData = await readBallotFixture();
  const scannedBallotFixtureFilepaths = getSampleBallotFilepaths();
  await executePrintBallotAndAssert(
    ballotPdfData,
    scannedBallotFixtureFilepaths
  );

  setMockDeviceStatus(getPaperInFrontStatus());
  await waitForStatus('presenting_ballot');
  expect(driver.presentPaper).toHaveBeenCalledTimes(1);

  machine.validateBallot();
  setMockDeviceStatus(getPaperInRearStatus());
  await waitForStatus('ejecting_to_rear');

  setMockDeviceStatus(getDefaultPaperHandlerStatus());
  await waitForStatus('ballot_accepted');
  expect(workspace.store.getBallotsCastSinceLastBoxChange()).toEqual(
    MAX_BALLOT_BOX_CAPACITY
  );

  await waitForStatus('empty_ballot_box');

  machine.confirmBallotBoxEmptied();
  await waitForStatus('not_accepting_paper');
});

test('blank page interpretation', async () => {
  const ballotPdfData = await readBallotFixture();
  const scannedBallotFixtureFilepaths: SheetOf<string> = [
    getBlankSheetFixturePath(),
    getBlankSheetFixturePath(),
  ];

  await executePrintBallotAndAssert(
    ballotPdfData,
    scannedBallotFixtureFilepaths
  );

  await waitForStatus('blank_page_interpretation');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BlankInterpretation,
    'system'
  );
  expect(driver.presentPaper).toHaveBeenCalledTimes(1);

  // Remove blank ballot
  mockPollWorkerAuth(auth, electionGeneralDefinition);
  setMockDeviceStatus(getDefaultPaperHandlerStatus());
  await sleep(TEST_POLL_INTERVAL_MS);

  // Prepare to insert new sheet
  setMockDeviceStatus(getPaperInFrontStatus());
  await sleep(TEST_POLL_INTERVAL_MS);

  expect(driver.loadPaper).toHaveBeenCalledTimes(1);
  expect(driver.parkPaper).toHaveBeenCalledTimes(1);
  setMockDeviceStatus(getPaperParkedStatus());

  await waitForStatus('paper_reloaded');

  const ballotStyle = electionGeneralDefinition.election.ballotStyles[1];
  // The fixture expects ballot style id 5
  assert(ballotStyle.id === '5');

  mockCardlessVoterAuth(auth, {
    ballotStyleId: ballotStyle.id,
    precinctId,
  });
  await waitForStatus('waiting_for_ballot_data');
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

describe('paper handler status observable', () => {
  test('logs if an error is thrown', async () => {
    mockOf(driver.getPaperHandlerStatus).mockRejectedValue(
      new Error('Test error')
    );
    await sleep(TEST_POLL_INTERVAL_MS);
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

    await waitForStatus('pat_device_connected');
    mockOf(HID.devices).mockClear();
  });

  test('successful connection flow', async () => {
    machine.setAcceptingPaper();
    await waitForStatus('accepting_paper');

    mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      true
    );
    await waitForStatus('pat_device_connected');

    machine.setPatDeviceIsCalibrated();
    // Should return to last state in history, not initial state
    await waitForStatus('accepting_paper');
  });

  test('disconnecting PAT device during calibration', async () => {
    machine.setAcceptingPaper();
    await waitForStatus('accepting_paper');

    mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      true
    );
    await waitForStatus('pat_device_connected');
    mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
      false
    );

    // Should return to last state in history, not initial state
    await waitForStatus('accepting_paper');
  });

  test('logs if an error is thrown when trying to read device connection status', async () => {
    const errorMessage = 'Test error in PAT';
    mockOf(patConnectionStatusReader.isPatDeviceConnected).mockRejectedValue(
      new Error(errorMessage)
    );
    await sleep(TEST_POLL_INTERVAL_MS);
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PatDeviceError,
      'system',
      {
        error: errorMessage,
      }
    );
  });
});
