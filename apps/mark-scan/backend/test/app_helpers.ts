import { expect, vi } from 'vitest';
import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { Application } from 'express';
import { AddressInfo } from 'node:net';
import {
  mockLogger,
  LogSource,
  Logger,
  mockBaseLogger,
} from '@votingworks/logging';
import tmp from 'tmp';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { Server } from 'node:http';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  backendWaitFor,
} from '@votingworks/test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
  SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { MockPaperHandlerDriver } from '@votingworks/custom-paper-handler';
import { assert, ok } from '@votingworks/basics';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import { SimulatedClock } from 'xstate/lib/SimulatedClock';
import { Api, buildApp } from '../src/app';
import { createWorkspace, Workspace } from '../src/util/workspace';
import {
  getPaperHandlerStateMachine,
  PaperHandlerStateMachine,
} from '../src/custom-paper-handler';
import { PatConnectionStatusReaderInterface } from '../src/pat-input/connection_status_reader';
import { getUserRole } from '../src/util/auth';
import { MockPatConnectionStatusReader } from '../src/pat-input/mock_connection_status_reader';

export function buildMockLogger(
  auth: InsertedSmartCardAuthApi,
  workspace: Workspace
): Logger {
  return mockLogger({
    source: LogSource.VxMarkScanBackend,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

export async function getMockStateMachine(
  workspace: Workspace,
  patConnectionStatusReader: PatConnectionStatusReaderInterface,
  driver: MockPaperHandlerDriver,
  logger: Logger,
  clock: SimulatedClock,
  authOverride?: InsertedSmartCardAuthApi
): Promise<PaperHandlerStateMachine> {
  // State machine setup
  const auth = authOverride ?? buildMockInsertedSmartCardAuth();
  const stateMachine = await getPaperHandlerStateMachine({
    workspace,
    auth,
    logger,
    driver,
    patConnectionStatusReader,
    clock,
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
  patConnectionStatusReader: PatConnectionStatusReaderInterface;
  driver: MockPaperHandlerDriver;
  clock: SimulatedClock;
}

export interface CreateAppOptions {
  patConnectionStatusReader?: PatConnectionStatusReaderInterface;
  pollingIntervalMs?: number;
}

export async function createApp(
  options?: CreateAppOptions
): Promise<MockAppContents> {
  const mockAuth = buildMockInsertedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    tmp.dirSync().name,
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(mockAuth, workspace);
  const mockUsbDrive = createMockUsbDrive();
  const patConnectionStatusReader =
    options?.patConnectionStatusReader ??
    new MockPatConnectionStatusReader(logger);
  const driver = new MockPaperHandlerDriver();
  const clock = new SimulatedClock();

  const stateMachine = await getMockStateMachine(
    workspace,
    patConnectionStatusReader,
    driver,
    logger,
    clock,
    mockAuth
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
    patConnectionStatusReader,
    driver,
    clock,
  };
}

export async function configureApp(
  apiClient: grout.Client<Api>,
  mockAuth: InsertedSmartCardAuthApi,
  mockUsbDrive: MockUsbDrive,
  systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): Promise<void> {
  const jurisdiction = TEST_JURISDICTION;
  const election = electionFamousNames2021Fixtures.readElection();
  const { electionJson } = electionFamousNames2021Fixtures;
  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(election),
        jurisdiction,
      }),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree(
      electionJson.toElectionPackage(systemSettings)
    )
  );
  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result).toEqual(ok(expect.anything()));
  vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );
}

export async function waitForStatus(
  apiClient: grout.Client<Api>,
  interval: number,
  status: string
): Promise<void> {
  await backendWaitFor(
    async () => {
      expect(await apiClient.getPaperHandlerState()).toEqual(status);
    },
    { interval, retries: 3 }
  );
}
