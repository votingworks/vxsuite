import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { Application } from 'express';
import { AddressInfo } from 'net';
import {
  BaseLogger,
  mockLogger,
  LogSource,
  Logger,
} from '@votingworks/logging';
import tmp from 'tmp';
import { mockElectionPackageFileTree } from '@votingworks/backend';
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
  defaultPaperHandlerStatus,
  MinimalWebUsbDevice,
  PaperHandlerDriver,
} from '@votingworks/custom-paper-handler';
import { assert } from '@votingworks/basics';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import { Api, buildApp } from '../src/app';
import { createWorkspace, Workspace } from '../src/util/workspace';
import {
  getPaperHandlerStateMachine,
  PaperHandlerStateMachine,
} from '../src/custom-paper-handler';
import {
  DEV_AUTH_STATUS_POLLING_INTERVAL_MS,
  DEV_DEVICE_STATUS_POLLING_INTERVAL_MS,
} from '../src/custom-paper-handler/constants';
import { MockPatConnectionStatusReader } from '../src/pat-input/mock_connection_status_reader';
import { getUserRole } from '../src/util/auth';

jest.mock('@votingworks/custom-paper-handler');

export function buildMockLogger(
  auth: InsertedSmartCardAuthApi,
  workspace: Workspace
): Logger {
  return mockLogger(LogSource.VxMarkScanBackend, () =>
    getUserRole(auth, workspace)
  );
}

export async function getMockStateMachine(
  workspace: Workspace,
  logger: BaseLogger
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
  const mockPatConnectionStatusReader = new MockPatConnectionStatusReader(
    logger
  );
  jest
    .spyOn(driver, 'getPaperHandlerStatus')
    .mockImplementation(() => Promise.resolve(defaultPaperHandlerStatus()));
  const stateMachine = await getPaperHandlerStateMachine({
    workspace,
    auth,
    logger,
    driver,
    patConnectionStatusReader: mockPatConnectionStatusReader,
    devicePollingIntervalMs: DEV_DEVICE_STATUS_POLLING_INTERVAL_MS,
    authPollingIntervalMs: DEV_AUTH_STATUS_POLLING_INTERVAL_MS,
  });
  assert(stateMachine);

  return stateMachine;
}

interface MockAppContents {
  apiClient: grout.Client<Api>;
  app: Application;
  logger: BaseLogger;
  mockAuth: InsertedSmartCardAuthApi;
  mockUsbDrive: MockUsbDrive;
  server: Server;
  stateMachine: PaperHandlerStateMachine;
}

export async function createApp(): Promise<MockAppContents> {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const workspace = createWorkspace(tmp.dirSync().name);
  const logger = buildMockLogger(mockAuth, workspace);
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
    logger,
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
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree(
      electionJson.toElectionPackage(systemSettings)
    )
  );
  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result.isOk()).toEqual(true);
  mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );
}
