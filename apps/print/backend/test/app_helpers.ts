import { vi } from 'vitest';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { Application } from 'express';
import { AddressInfo } from 'node:net';
import {
  mockLogger,
  LogSource,
  Logger,
  mockBaseLogger,
} from '@votingworks/logging';
import tmp from 'tmp';
import { Server } from 'node:http';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import {
  createMockPrinterHandler,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import * as grout from '@votingworks/grout';
import { Api, buildApp } from '../src/app';
import { createWorkspace, Workspace } from '../src/util/workspace';
import { getUserRole } from '../src/util/auth';
import { AppContext } from '../src/context';

interface MockAppContents {
  apiClient: grout.Client<Api>;
  app: Application;
  logger: Logger;
  mockAuth: DippedSmartCardAuthApi;
  mockUsbDrive: MockUsbDrive;
  mockPrinterHandler: MemoryPrinterHandler;
  server: Server;
}

export function buildMockLogger(
  auth: DippedSmartCardAuthApi,
  workspace: Workspace
): Logger {
  return mockLogger({
    source: LogSource.VxPrintBackend,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

export function createApp(): MockAppContents {
  const workspace = createWorkspace(
    tmp.dirSync().name,
    mockBaseLogger({ fn: vi.fn })
  );
  const mockAuth = buildMockDippedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(mockAuth, workspace);
  const mockUsbDrive = createMockUsbDrive();
  const mockPrinterHandler = createMockPrinterHandler();

  const context: AppContext = {
    auth: mockAuth,
    logger,
    workspace,
    usbDrive: mockUsbDrive.usbDrive,
    printer: mockPrinterHandler.printer,
  };

  const app = buildApp(context);

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
    mockPrinterHandler,
    server,
  };
}
