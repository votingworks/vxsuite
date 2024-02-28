import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { Application } from 'express';
import { AddressInfo } from 'net';
import { fakeLogger, Logger } from '@votingworks/logging';
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
import { MockPaperHandlerDriver } from '@votingworks/custom-paper-handler';
import { assert } from '@votingworks/basics';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import { Api, buildApp } from '../src/app';
import { createWorkspace, Workspace } from '../src/util/workspace';
import {
  getPaperHandlerStateMachine,
  PaperHandlerStateMachine,
} from '../src/custom-paper-handler';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  DEVICE_STATUS_POLLING_INTERVAL_MS,
  SUCCESS_NOTIFICATION_DURATION_MS,
} from '../src/custom-paper-handler/constants';
import { MockPatConnectionStatusReader } from '../src/pat-input/mock_connection_status_reader';

export async function getMockStateMachine(
  workspace: Workspace,
  mockPatConnectionStatusReader: MockPatConnectionStatusReader,
  driver: MockPaperHandlerDriver,
  logger: Logger
): Promise<PaperHandlerStateMachine> {
  // State machine setup
  const auth = buildMockInsertedSmartCardAuth();
  const stateMachine = await getPaperHandlerStateMachine({
    workspace,
    auth,
    logger,
    driver,
    patConnectionStatusReader: mockPatConnectionStatusReader,
    devicePollingIntervalMs: DEVICE_STATUS_POLLING_INTERVAL_MS,
    authPollingIntervalMs: AUTH_STATUS_POLLING_INTERVAL_MS,
    notificationDurationMs: SUCCESS_NOTIFICATION_DURATION_MS,
  });
  assert(stateMachine);

  return stateMachine;
}

interface MockAppContents {
  apiClient: grout.Client<Api>;
  app: Application;
  logger: Logger;
  mockAuth: InsertedSmartCardAuthApi;
  mockUsbDrive: MockUsbDrive;
  server: Server;
  stateMachine: PaperHandlerStateMachine;
  mockPatConnectionStatusReader: MockPatConnectionStatusReader;
  driver: MockPaperHandlerDriver;
}

export async function createApp(): Promise<MockAppContents> {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const logger = fakeLogger();
  const workspace = createWorkspace(tmp.dirSync().name);
  const mockUsbDrive = createMockUsbDrive();
  const mockPatConnectionStatusReader = new MockPatConnectionStatusReader(
    logger
  );
  const driver = new MockPaperHandlerDriver();

  const stateMachine = await getMockStateMachine(
    workspace,
    mockPatConnectionStatusReader,
    driver,
    logger
  );

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
    mockPatConnectionStatusReader,
    driver,
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
