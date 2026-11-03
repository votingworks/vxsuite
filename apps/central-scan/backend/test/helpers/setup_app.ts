import { expect, type Mocked, test, vi } from 'vitest';
import type { Application } from 'express';
import {
  LogSource,
  type Logger,
  type MockLogger,
  mockBaseLogger,
  mockLogger,
} from '@votingworks/logging';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import * as grout from '@votingworks/grout';
import {
  type DippedSmartCardAuthApi,
  buildMockDippedSmartCardAuth,
} from '@votingworks/auth';
import { dirSync } from 'tmp';
import { type MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { importElectionPackageForTest } from '@votingworks/backend/test-utils';
import {
  type ElectionDefinition,
  type SystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { type Workspace, createWorkspace } from '../../src/util/workspace.js';
import { type MockScanner, makeMockScanner } from '../util/mocks.js';
import {
  type BatchScannerStateMachine,
  createBatchScannerStateMachine,
} from '../../src/scanner.js';
import type { ScanStatus } from '../../src/types.js';
import type { Api } from '../../src/index.js';
import { buildCentralScannerApp } from '../../src/app.js';
import { start } from '../../src/server.js';
import type { Store } from '../../src/store.js';
import { getUserRole } from '../../src/util/auth.js';

export function buildMockLogger(
  auth: DippedSmartCardAuthApi,
  workspace: Workspace
): MockLogger {
  return mockLogger({
    source: LogSource.VxCentralScanService,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

export interface TestAppContext {
  auth: Mocked<DippedSmartCardAuthApi>;
  workspace: Workspace;
  scanner: MockScanner;
  mockUsbDrive: MockUsbDrive;
  machine: BatchScannerStateMachine;
  app: Application;
  logger: Logger;
  apiClient: grout.Client<Api>;
  server: Server;
  store: Store;
}

/** Resolves to the port `server` is listening on. */
export async function getListeningPort(server: Server): Promise<number> {
  if (!server.listening) {
    await once(server, 'listening');
  }
  return (server.address() as AddressInfo).port;
}

export function testWithApp(
  name: string,
  fn: (ctx: TestAppContext) => Promise<void>
): void {
  test(name, async () => withApp(fn));
}

export async function withApp(
  fn: (ctx: TestAppContext) => Promise<void>
): Promise<void> {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    dirSync().name,
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const scanner = makeMockScanner();
  const machine = createBatchScannerStateMachine({
    workspace,
    scanner,
    logger,
  });
  const mockUsbDrive = createMockUsbDrive();
  const app = buildCentralScannerApp({
    auth,
    usbDrive: mockUsbDrive.usbDrive,
    allowedExportPatterns: ['/tmp/**'],
    scanner,
    machine,
    workspace,
    logger,
  });
  const server = start({
    app,
    logger,
    workspace,
    port: 0,
  });
  const port = await getListeningPort(server);
  const apiClient = grout.createClient<Api>({
    baseUrl: `http://localhost:${port}/api`,
  });

  try {
    await fn({
      auth,
      workspace,
      store: workspace.store,
      scanner,
      mockUsbDrive,
      machine,
      app,
      logger,
      apiClient,
      server,
    });
  } finally {
    machine.stop();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    workspace.unconfigure();
    workspace[Symbol.dispose]();
  }
}

export function waitForStatus<State extends ScanStatus['state']>(
  apiClient: grout.Client<Api>,
  status: { state: State } & Partial<ScanStatus>
): Promise<Extract<ScanStatus, { state: State }>> {
  return vi.waitFor(
    async () => {
      const currentStatus = await apiClient.getStatus();
      expect(currentStatus).toMatchObject(status);
      return currentStatus as Extract<ScanStatus, { state: State }>;
    },
    { timeout: 10_000 }
  );
}

/**
 * Configures `store` from a package built from `electionPackage`, the way the
 * app does, and starts the election session.
 */
export async function configureStore(
  store: Store,
  {
    electionDefinition,
    systemSettings,
    jurisdiction = TEST_JURISDICTION,
    electionPackageHash = 'test-election-package-hash',
    pollingPlaceId,
  }: {
    electionDefinition: ElectionDefinition;
    systemSettings?: SystemSettings;
    jurisdiction?: string;
    electionPackageHash?: string;
    pollingPlaceId?: string;
  }
): Promise<void> {
  // Importing streams the package zip, which stalls under fake timers.
  const fakeTimers = vi.isFakeTimers();
  if (fakeTimers) vi.useRealTimers();
  await importElectionPackageForTest(
    store.getElectionPackageStore(),
    { electionDefinition, systemSettings },
    { jurisdiction, electionPackageHash, uiStrings: false }
  );
  if (fakeTimers) vi.useFakeTimers();
  store.startElectionSession();
  if (pollingPlaceId) {
    store.setPollingPlaceId(pollingPlaceId);
  }
}
