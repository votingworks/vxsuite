import { vi } from 'vitest';
import tmp from 'tmp';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import {
  createMockPrinterHandler,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import {
  LogSource,
  mockBaseLogger,
  MockLogger,
  mockLogger,
} from '@votingworks/logging';
import * as grout from '@votingworks/grout';
import { Application } from 'express';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { LocalApi, buildLocalApp } from '../src/app';
import { createLocalWorkspace } from '../src/workspace';
import { LocalWorkspace } from '../src';
import { getUserRole } from '../src/auth';

interface TestContext {
  auth: DippedSmartCardAuthApi;
  workspace: LocalWorkspace;
  mockUsbDrive: MockUsbDrive;
  mockPrinterHandler: MemoryPrinterHandler;
  apiClient: grout.Client<LocalApi>;
  app: Application;
  server: Server;
}

export function buildMockLogger(
  auth: DippedSmartCardAuthApi,
  workspace: LocalWorkspace
): MockLogger {
  return mockLogger({
    source: LogSource.VxPollbookBackend,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

export async function withApp(
  fn: (context: TestContext) => Promise<void>
): Promise<void> {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createLocalWorkspace(
    tmp.dirSync().name,
    mockBaseLogger({ fn: vi.fn }),
    process.env.VX_MACHINE_ID || 'test'
  );

  const logger = buildMockLogger(auth, workspace);

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.sync.expectOptionalRepeatedCallsWith().resolves(); // Called by paper backup export

  const mockPrinterHandler = createMockPrinterHandler();

  const app = buildLocalApp({
    context: {
      auth,
      workspace,
      usbDrive: mockUsbDrive.usbDrive,
      printer: mockPrinterHandler.printer,
      machineId: process.env.VX_MACHINE_ID || 'test',
      codeVersion: process.env.VX_CODE_VERSION || 'test',
    },
    logger,
  });

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  const apiClient = grout.createClient<Api>({ baseUrl });

  try {
    await fn({
      auth,
      workspace,
      mockUsbDrive,
      mockPrinterHandler,
      apiClient,
      app,
      server,
    });
    mockUsbDrive.assertComplete();
  } finally {
    // wait for paper backup export to finish?
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
