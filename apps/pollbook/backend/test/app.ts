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
import { createLocalWorkspace, createPeerWorkspace } from '../src/workspace';
import { LocalWorkspace, PeerWorkspace } from '../src';
import { getUserRole } from '../src/auth';
import { buildPeerApp, PeerApi } from '../src/peer_app';

interface TestContext {
  auth: DippedSmartCardAuthApi;
  workspace: LocalWorkspace;
  peerWorkspace: PeerWorkspace;
  mockUsbDrive: MockUsbDrive;
  mockPrinterHandler: MemoryPrinterHandler;
  localApiClient: grout.Client<LocalApi>;
  peerApiClient: grout.Client<PeerApi>;
  app: Application;
  localServer: Server;
  peerServer: Server;
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
  const workspacePath = tmp.dirSync().name;
  const workspace = createLocalWorkspace(
    workspacePath,
    mockBaseLogger({ fn: vi.fn }),
    process.env.VX_MACHINE_ID || 'test'
  );
  const peerWorkspace = createPeerWorkspace(
    workspacePath,
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
  const peerApp = buildPeerApp({
    workspace: peerWorkspace,
    machineId: process.env.VX_MACHINE_ID || 'test',
    codeVersion: process.env.VX_CODE_VERSION || 'test',
  });

  const localServer = app.listen();
  const { port: localPort } = localServer.address() as AddressInfo;
  const localBaseUrl = `http://localhost:${localPort}/api`;

  const peerServer = peerApp.listen();
  const { port: peerPort } = peerServer.address() as AddressInfo;
  const peerBaseUrl = `http://localhost:${peerPort}/api`;

  const localApiClient = grout.createClient<LocalApi>({
    baseUrl: localBaseUrl,
  });
  const peerApiClient = grout.createClient<PeerApi>({ baseUrl: peerBaseUrl });

  try {
    await fn({
      auth,
      workspace,
      mockUsbDrive,
      mockPrinterHandler,
      localApiClient,
      peerApiClient,
      app,
      localServer,
      peerServer,
      peerWorkspace,
    });
    mockUsbDrive.assertComplete();
  } finally {
    // wait for paper backup export to finish?
    await new Promise<void>((resolve, reject) => {
      localServer.close((error) => (error ? reject(error) : resolve()));
      peerServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

/*
 **
 ** Creates N instances of mock pollbook apps in order to test multi-pollbook scenarios.
 */
export async function withManyApps(
  n: number,
  fn: (contexts: TestContext[]) => Promise<void>
): Promise<void> {
  const contexts: TestContext[] = [];

  try {
    for (let i = 0; i < n; i += 1) {
      const auth = buildMockDippedSmartCardAuth(vi.fn);
      const workspacePath = tmp.dirSync().name;
      const workspace = createLocalWorkspace(
        workspacePath,
        mockBaseLogger({ fn: vi.fn }),
        `test-${i}`
      );
      const peerWorkspace = createPeerWorkspace(
        workspacePath,
        mockBaseLogger({ fn: vi.fn }),
        `test-${i}`
      );

      const logger = buildMockLogger(auth, workspace);

      const mockUsbDrive = createMockUsbDrive();
      mockUsbDrive.usbDrive.sync.expectOptionalRepeatedCallsWith().resolves();

      const mockPrinterHandler = createMockPrinterHandler();

      const app = buildLocalApp({
        context: {
          auth,
          workspace,
          usbDrive: mockUsbDrive.usbDrive,
          printer: mockPrinterHandler.printer,
          machineId: `test-${i}`,
          codeVersion: process.env.VX_CODE_VERSION || 'test',
        },
        logger,
      });
      const peerApp = buildPeerApp({
        workspace: peerWorkspace,
        machineId: `test-${i}`,
        codeVersion: process.env.VX_CODE_VERSION || 'test',
      });

      const localServer = app.listen();
      const { port: localPort } = localServer.address() as AddressInfo;
      const localBaseUrl = `http://localhost:${localPort}/api`;

      const peerServer = peerApp.listen();
      const { port: peerPort } = peerServer.address() as AddressInfo;
      const peerBaseUrl = `http://localhost:${peerPort}/api`;

      const localApiClient = grout.createClient<LocalApi>({
        baseUrl: localBaseUrl,
      });
      const peerApiClient = grout.createClient<PeerApi>({
        baseUrl: peerBaseUrl,
      });

      contexts.push({
        auth,
        workspace,
        mockUsbDrive,
        mockPrinterHandler,
        localApiClient,
        peerApiClient,
        app,
        localServer,
        peerServer,
        peerWorkspace,
      });
    }

    await fn(contexts);

    for (const context of contexts) {
      context.mockUsbDrive.assertComplete();
    }
  } finally {
    for (const context of contexts) {
      await new Promise<void>((resolve, reject) => {
        context.localServer.close((error) =>
          error ? reject(error) : resolve()
        );
        context.peerServer.close((error) =>
          error ? reject(error) : resolve()
        );
      });
    }
  }
}
