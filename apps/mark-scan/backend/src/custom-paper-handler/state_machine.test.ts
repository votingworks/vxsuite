import { assert, sleep } from '@votingworks/basics';
import {
  PaperHandlerDriver,
  MinimalWebUsbDevice,
  PaperHandlerStatus,
} from '@votingworks/custom-paper-handler';
import { dirSync } from 'tmp';
import { Logger, fakeLogger } from '@votingworks/logging';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import {
  PaperHandlerStateMachine,
  getPaperHandlerStateMachine,
} from './state_machine';
import { Workspace, createWorkspace } from '../util/workspace';
import { defaultPaperHandlerStatus } from '../../test/app_helpers';

// Use shorter polling interval in tests to reduce run times
const TEST_POLLING_INTERVAL_MS = 10;

jest.mock('@votingworks/custom-paper-handler');

let driver: PaperHandlerDriver;
let workspace: Workspace;
let machine: PaperHandlerStateMachine;
let logger: Logger;

beforeEach(async () => {
  logger = fakeLogger();
  const auth = buildMockInsertedSmartCardAuth();
  workspace = createWorkspace(dirSync().name);
  const webDevice: MinimalWebUsbDevice = {
    open: jest.fn(),
    close: jest.fn(),
    transferOut: jest.fn(),
    transferIn: jest.fn(),
    claimInterface: jest.fn(),
    selectConfiguration: jest.fn(),
  };
  driver = new PaperHandlerDriver(webDevice);
  jest
    .spyOn(driver, 'syncScannerConfig')
    .mockImplementation(() => Promise.resolve(false));
  jest
    .spyOn(driver, 'getPaperHandlerStatus')
    .mockImplementation(() => Promise.resolve(defaultPaperHandlerStatus()));

  machine = (await getPaperHandlerStateMachine(
    driver,
    workspace,
    auth,
    logger,
    TEST_POLLING_INTERVAL_MS
  )) as PaperHandlerStateMachine;
});

afterEach(() => {
  machine.stopMachineService();
});

it('transitions from accepting_paper to loading_paper state when front sensors are triggered', async () => {
  const connectResult = await driver.syncScannerConfig();
  expect(connectResult).toEqual(false);

  assert(machine);
  machine.setAcceptingPaper();
  expect(machine.getSimpleStatus()).toEqual('accepting_paper');
  await sleep(TEST_POLLING_INTERVAL_MS);
  expect(driver.getPaperHandlerStatus).toHaveBeenCalled();
  const paperReadyToLoadStatus: PaperHandlerStatus = {
    ...defaultPaperHandlerStatus(),
    paperInputLeftInnerSensor: true,
    paperInputLeftOuterSensor: true,
    paperInputRightInnerSensor: true,
    paperInputRightOuterSensor: true,
  };
  jest
    .spyOn(driver, 'getPaperHandlerStatus')
    .mockImplementation(() => Promise.resolve(paperReadyToLoadStatus));
  await sleep(TEST_POLLING_INTERVAL_MS);
  expect(machine.getSimpleStatus()).toEqual('loading_paper');
});
