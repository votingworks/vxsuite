import { vi, VitestUtils, expect } from 'vitest';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
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
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import {
  constructElectionKey,
  DippedSmartCardAuth,
  Election,
} from '@votingworks/types';
import { LocalApi, buildLocalApp } from '../src/app';
import { createLocalWorkspace, createPeerWorkspace } from '../src/workspace';
import {
  LocalWorkspace,
  PeerWorkspace,
  PollbookConnectionStatus,
} from '../src';
import { getUserRole } from '../src/auth';
import { buildPeerApp, PeerApi } from '../src/peer_app';
import { BarcodeScannerClient } from '../src/barcode_scanner/client';
import { AvahiService, hasOnlineInterface } from '../src/avahi';
import {
  EVENT_POLLING_INTERVAL,
  NETWORK_POLLING_INTERVAL,
} from '../src/globals';

vi.mock('../barcode_scanner/client', () => ({
  BarcodeScannerClient: vi.fn().mockImplementation(() => ({
    listen: vi.fn().mockResolvedValue(undefined),
    readScannedValue: vi.fn().mockReturnValue(undefined),
  })),
}));

export const TEST_MACHINE_ID = '0102';

export interface TestContext {
  auth: DippedSmartCardAuthApi;
  workspace: LocalWorkspace;
  peerWorkspace: PeerWorkspace;
  mockUsbDrive: MockUsbDrive;
  mockPrinterHandler: MemoryPrinterHandler;
  localApiClient: grout.Client<LocalApi>;
  peerApiClient: grout.Client<PeerApi>;
  app: Application;
  peerApp: Application;
  localServer: Server;
  peerServer: Server;
}

export function buildMockLogger(
  auth: DippedSmartCardAuthApi,
  workspace: LocalWorkspace
): MockLogger {
  return mockLogger({
    source: LogSource.VxPollBookBackend,
    getCurrentRole: () => getUserRole(auth, workspace),
    fn: vi.fn,
  });
}

export function mockAuthStatus(
  auth: DippedSmartCardAuthApi,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  const mockGetAuthStatus = vi.mocked(auth.getAuthStatus);
  mockGetAuthStatus.mockResolvedValue(authStatus);
}

export function mockLoggedOut(auth: DippedSmartCardAuthApi): void {
  mockAuthStatus(auth, {
    status: 'logged_out',
    reason: 'machine_locked',
  });
}

export function mockSystemAdministratorAuth(
  auth: DippedSmartCardAuthApi
): void {
  mockAuthStatus(auth, {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  });
}

export function mockElectionManagerAuth(
  auth: DippedSmartCardAuthApi,
  election: Election
): void {
  mockAuthStatus(auth, {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
}

export async function withApp(
  fn: (context: TestContext) => Promise<void>
): Promise<void> {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspacePath = makeTemporaryDirectory();
  const machineId = process.env.VX_MACHINE_ID || TEST_MACHINE_ID;
  const codeVersion = process.env.VX_CODE_VERSION || 'test';
  const peerWorkspace = createPeerWorkspace(
    workspacePath,
    mockBaseLogger({ fn: vi.fn }),
    machineId,
    codeVersion
  );
  const peerApp = buildPeerApp({
    auth,
    workspace: peerWorkspace,
    machineId,
    codeVersion,
  });

  const peerServer = peerApp.listen();
  const { port: peerPort } = peerServer.address() as AddressInfo;
  const peerBaseUrl = `http://localhost:${peerPort}/api`;

  const workspace = createLocalWorkspace(
    workspacePath,
    mockBaseLogger({ fn: vi.fn }),
    peerPort,
    machineId,
    codeVersion
  );
  const logger = buildMockLogger(auth, workspace);
  const barcodeScannerClient = new BarcodeScannerClient(logger);

  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.sync.expectOptionalRepeatedCallsWith().resolves(); // Called by paper backup export

  const mockPrinterHandler = createMockPrinterHandler();

  const app = buildLocalApp({
    context: {
      auth,
      workspace,
      usbDrive: mockUsbDrive.usbDrive,
      printer: mockPrinterHandler.printer,
      machineId,
      codeVersion,
    },
    logger,
    barcodeScannerClient,
  });

  const localServer = app.listen();
  const { port: localPort } = localServer.address() as AddressInfo;
  const localBaseUrl = `http://localhost:${localPort}/api`;

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
      peerApp,
      localServer,
      peerServer,
      peerWorkspace,
    });
    mockUsbDrive.assertComplete();
  } finally {
    // wait for paper backup export to finish?
    await new Promise<void>((resolve, reject) => {
      AvahiService.stopAdvertisedService();
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
  fn: (contexts: TestContext[]) => Promise<void>,
  setUniqueCodeVersions: boolean = false
): Promise<void> {
  const contexts: TestContext[] = [];

  try {
    for (let i = 0; i < n; i += 1) {
      const codeVersion = setUniqueCodeVersions
        ? `test-${i}`
        : process.env.VX_CODE_VERSION || 'test';

      const auth = buildMockDippedSmartCardAuth(vi.fn);
      const workspacePath = makeTemporaryDirectory();
      const peerWorkspace = createPeerWorkspace(
        workspacePath,
        mockBaseLogger({ fn: vi.fn }),
        `test-${i}`,
        codeVersion
      );

      const peerApp = buildPeerApp({
        auth,
        workspace: peerWorkspace,
        machineId: `test-${i}`,
        codeVersion,
      });

      const peerServer = peerApp.listen();
      const { port: peerPort } = peerServer.address() as AddressInfo;
      const peerBaseUrl = `http://localhost:${peerPort}/api`;

      const mockUsbDrive = createMockUsbDrive();
      mockUsbDrive.usbDrive.sync.expectOptionalRepeatedCallsWith().resolves();

      const mockPrinterHandler = createMockPrinterHandler();

      const workspace = createLocalWorkspace(
        workspacePath,
        mockBaseLogger({ fn: vi.fn }),
        peerPort,
        `test-${i}`,
        codeVersion
      );
      const logger = buildMockLogger(auth, workspace);
      const barcodeScannerClient = new BarcodeScannerClient(logger);

      const app = buildLocalApp({
        context: {
          auth,
          workspace,
          usbDrive: mockUsbDrive.usbDrive,
          printer: mockPrinterHandler.printer,
          machineId: `test-${i}`,
          codeVersion,
        },
        logger,
        barcodeScannerClient,
      });

      const localServer = app.listen();
      const { port: localPort } = localServer.address() as AddressInfo;
      const localBaseUrl = `http://localhost:${localPort}/api`;

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
        peerApp,
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
      const serviceName = `Pollbook-test-${contexts.indexOf(context)}`;
      await new Promise<void>((resolve, reject) => {
        AvahiService.stopAdvertisedService(serviceName);
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
export function extendedWaitFor(
  fn: () => void | Promise<void>,
  timeout: number = 5000
): Promise<void> {
  return vi.waitFor(fn, { timeout });
}

export async function setupUnconfiguredPollbooksOnNetwork(
  pollbookContexts: TestContext[],
  vitest: VitestUtils,
  hasOnlineInterfaceMock: ReturnType<
    typeof vi.mocked<typeof hasOnlineInterface>
  >,
  discoverHttpServicesMock: ReturnType<typeof vi.spyOn>
): Promise<void> {
  for (const context of pollbookContexts) {
    context.mockUsbDrive.insertUsbDrive({});
  }
  // Mock hasOnlineInterface to always return true
  hasOnlineInterfaceMock.mockResolvedValue(true);

  // Set up spies for all pollbook contexts
  const spies = pollbookContexts.map((context) =>
    vi.spyOn(context.peerWorkspace.store, 'getNewEvents')
  );

  // Get ports for all pollbook contexts
  const ports = pollbookContexts.map((context) => {
    const { port } = context.peerServer.address() as AddressInfo;
    return port;
  });

  // Mock discovered services for all pollbooks
  discoverHttpServicesMock.mockResolvedValue(
    pollbookContexts.map((_, index) => ({
      name: `Pollbook-test-${index}`,
      host: 'local',
      resolvedIp: 'localhost',
      port: ports[index].toString(),
    }))
  );
  vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);

  await extendedWaitFor(async () => {
    const deviceStatuses =
      await pollbookContexts[0].localApiClient.getDeviceStatuses();
    expect(deviceStatuses.network.isOnline).toEqual(true);
    expect(deviceStatuses.network.pollbooks).toHaveLength(
      pollbookContexts.length - 1
    );
    for (const pollbook of deviceStatuses.network.pollbooks) {
      expect(pollbook).toEqual(
        expect.objectContaining({
          status: PollbookConnectionStatus.MismatchedConfiguration,
        })
      );
    }
  });

  vitest.advanceTimersByTime(NETWORK_POLLING_INTERVAL);

  await extendedWaitFor(async () => {
    // All pollbooks should now see each other with mismatched configuration
    for (const context of pollbookContexts) {
      const deviceStatuses = await context.localApiClient.getDeviceStatuses();
      expect(deviceStatuses.network.isOnline).toEqual(true);
      expect(deviceStatuses.network.pollbooks).toHaveLength(
        pollbookContexts.length - 1
      );
      for (const pollbook of deviceStatuses.network.pollbooks) {
        expect(pollbook).toEqual(
          expect.objectContaining({
            status: PollbookConnectionStatus.MismatchedConfiguration,
          })
        );
      }
    }
  });

  await extendedWaitFor(() => {
    vi.advanceTimersByTime(EVENT_POLLING_INTERVAL);
    for (const [i, spy] of spies.entries()) {
      // Before connecting the pollbooks should not have queried one another for events
      const calls = spy.mock.calls.length;
      if (calls > 0) {
        throw new Error(
          `getNewEvents was called ${calls} times in context ${i}`
        );
      }
    }
  });
}
