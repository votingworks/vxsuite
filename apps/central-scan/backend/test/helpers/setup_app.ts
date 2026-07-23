import { Mocked, vi } from 'vitest';
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
import { Workspace, createWorkspace } from '../../src/util/workspace';
import { MockScanner, makeMockScanner } from '../util/mocks';
import { Importer } from '../../src/importer';
import { Api } from '../../src';
import { buildCentralScannerApp } from '../../src/app';
import { CvrSync, startCvrSync } from '../../src/cvr_sync';
import { AdminHostClient } from '../../src/networking';
import { start } from '../../src/server';
import { Store } from '../../src/store';
import { getUserRole } from '../../src/util/auth';

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
    importer: Importer;
    app: Application;
    logger: Logger;
    apiClient: grout.Client<Api>;
    server: Server;
    store: Store;
    cvrSync?: CvrSync;
  }) => Promise<void>,
  options: {
    adminHostClient?: AdminHostClient;
    cvrSyncPollingIntervalMs?: number;
    cvrSyncUploadTimeoutMs?: number;
    isDeskProScanner?: boolean;
  } = {}
): Promise<void> {
  const port = await getPort();
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    dirSync().name,
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const scanner = makeMockScanner();
  const importer = new Importer({ workspace, scanner, logger });
  const mockUsbDrive = createMockUsbDrive();
  const cvrSync = options.adminHostClient
    ? startCvrSync({
        workspace,
        adminHostClient: options.adminHostClient,
        logger,
        pollingIntervalMs: options.cvrSyncPollingIntervalMs,
        uploadTimeoutMs: options.cvrSyncUploadTimeoutMs,
      })
    : undefined;
  const app = buildCentralScannerApp({
    auth,
    usbDrive: mockUsbDrive.usbDrive,
    allowedExportPatterns: ['/tmp/**'],
    scanner,
    importer,
    workspace,
    logger,
    adminHostClient: options.adminHostClient,
    cvrSync,
    isDeskProScanner: options.isDeskProScanner,
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
      importer,
      app,
      logger,
      apiClient,
      server,
      cvrSync,
    });
  } finally {
    cvrSync?.stop();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    workspace.reset();
  }
}
