import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { Application } from 'express';
import { AddressInfo } from 'net';
import { fakeLogger, Logger } from '@votingworks/logging';
import tmp from 'tmp';
import { createBallotPackageZipArchive } from '@votingworks/backend';
import { Server } from 'http';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  MinimalWebUsbDevice,
  PaperHandlerDriver,
  PaperHandlerStatus,
} from '@votingworks/custom-paper-handler';
import { assert } from '@votingworks/basics';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import { Api, buildApp } from '../src/app';
import { createWorkspace, Workspace } from '../src/util/workspace';
import {
  getPaperHandlerStateMachine,
  PaperHandlerStateMachine,
} from '../src/custom-paper-handler';
import { DEV_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS } from '../src/custom-paper-handler/constants';

jest.mock('@votingworks/custom-paper-handler');

export function defaultPaperHandlerStatus(): PaperHandlerStatus {
  return {
    // Scanner status
    requestId: 1,
    returnCode: 1,
    parkSensor: false,
    paperOutSensor: false,
    paperPostCisSensor: false,
    paperPreCisSensor: false,
    paperInputLeftInnerSensor: false,
    paperInputRightInnerSensor: false,
    paperInputLeftOuterSensor: false,
    paperInputRightOuterSensor: false,
    printHeadInPosition: false,
    scanTimeout: false,
    motorMove: false,
    scanInProgress: false,
    jamEncoder: false,
    paperJam: false,
    coverOpen: false,
    optoSensor: false,
    ballotBoxDoorSensor: false,
    ballotBoxAttachSensor: false,
    preHeadSensor: false,

    // Printer status
    ticketPresentInOutput: false,
    paperNotPresent: true,
    dragPaperMotorOn: false,
    spooling: false,
    printingHeadUpError: false,
    notAcknowledgeCommandError: false,
    powerSupplyVoltageError: false,
    headNotConnected: false,
    comError: false,
    headTemperatureError: false,
    diverterError: false,
    headErrorLocked: false,
    printingHeadReadyToPrint: true,
    eepromError: false,
    ramError: false,
  };
}

export async function getMockStateMachine(
  workspace: Workspace,
  logger: Logger
): Promise<PaperHandlerStateMachine> {
  // State machine setup
  const webDevice: MinimalWebUsbDevice = {
    open: jest.fn(),
    close: jest.fn(),
    transferOut: jest.fn(),
    transferIn: jest.fn(),
    claimInterface: jest.fn(),
    selectConfiguration: jest.fn(),
  };
  const driver = new PaperHandlerDriver(webDevice);
  const auth = buildMockInsertedSmartCardAuth();
  jest
    .spyOn(driver, 'getPaperHandlerStatus')
    .mockImplementation(() => Promise.resolve(defaultPaperHandlerStatus()));
  const stateMachine = await getPaperHandlerStateMachine(
    driver,
    workspace,
    auth,
    logger,
    DEV_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS
  );
  assert(stateMachine);

  return stateMachine;
}

interface MockAppContents {
  apiClient: grout.Client<Api>;
  app: Application;
  mockAuth: InsertedSmartCardAuthApi;
  mockUsbDrive: MockUsbDrive;
  server: Server;
  stateMachine: PaperHandlerStateMachine;
}

export async function createApp(): Promise<MockAppContents> {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const logger = fakeLogger();
  const workspace = createWorkspace(tmp.dirSync().name);
  const mockUsbDrive = createMockUsbDrive();

  const stateMachine = await getMockStateMachine(workspace, logger);

  const app = buildApp(
    mockAuth,
    logger,
    workspace,
    mockUsbDrive.usbDrive,
    stateMachine
  );

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  const apiClient = grout.createClient<Api>({ baseUrl });

  return {
    apiClient,
    app,
    mockAuth,
    mockUsbDrive,
    server,
    stateMachine,
  };
}

export async function configureApp(
  apiClient: grout.Client<Api>,
  mockAuth: InsertedSmartCardAuthApi,
  mockUsbDrive: MockUsbDrive,
  systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): Promise<void> {
  const jurisdiction = TEST_JURISDICTION;
  const { electionJson, electionDefinition } = electionFamousNames2021Fixtures;
  const { electionHash } = electionDefinition;
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: fakeElectionManagerUser({ electionHash, jurisdiction }),
      sessionExpiresAt: fakeSessionExpiresAt(),
    })
  );
  mockUsbDrive.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': await createBallotPackageZipArchive(
        electionJson.toBallotPackage(systemSettings)
      ),
    },
  });
  const result = await apiClient.configureBallotPackageFromUsb();
  expect(result.isOk()).toEqual(true);
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );
}
