import { expect, Mocked, vi } from 'vitest';
import { Application } from 'express';
import {
  LogSource,
  Logger,
  MockLogger,
  mockBaseLogger,
  mockLogger,
} from '@votingworks/logging';
import { Server } from 'node:http';
import * as grout from '@votingworks/grout';
import {
  DippedSmartCardAuthApi,
  buildMockDippedSmartCardAuth,
} from '@votingworks/auth';
import { dirSync } from 'tmp';
import getPort from 'get-port';
import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { Workspace, createWorkspace } from '../../src/util/workspace.js';
import { MockScanner, makeMockScanner } from '../util/mocks.js';
import {
  BatchScannerStateMachine,
  createBatchScannerStateMachine,
} from '../../src/scanner.js';
import { ScanStatus } from '../../src/types.js';
import { Api } from '../../src/index.js';
import { buildCentralScannerApp } from '../../src/app.js';
import { start } from '../../src/server.js';
import { Store } from '../../src/store.js';
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

export async function withApp(
  fn: (context: {
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
  }) => Promise<void>
): Promise<void> {
  const port = await getPort();
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
  const baseUrl = `http://localhost:${port}/api`;
  const apiClient = grout.createClient({
    baseUrl,
  });
  const server = start({
    app,
    logger,
    workspace,
    port,
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
    workspace.reset();
  }
}

export async function waitForStatus(
  apiClient: grout.Client<Api>,
  status: Pick<ScanStatus, 'state'> & Partial<ScanStatus>
): Promise<void> {
  await vi.waitFor(
    async () => {
      expect(await apiClient.getStatus()).toMatchObject(status);
    },
    { timeout: 10_000 }
  );
}
