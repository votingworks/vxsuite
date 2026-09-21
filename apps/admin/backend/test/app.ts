import { expect, Mocked, vi } from 'vitest';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
  zipFile,
} from '@votingworks/test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth,
  Election,
  constructElectionKey,
  ElectionDefinition,
  ElectionPackageFileName,
  ElectionRegisteredVoterCounts,
  LATEST_METADATA,
  SystemSettings,
} from '@votingworks/types';
import * as grout from '@votingworks/grout';
import { AddressInfo } from 'node:net';
import { Buffer } from 'node:buffer';
import {
  generateElectionBasedSubfolderName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import {
  detectMultiUsbDrive,
  MultiUsbDrive,
  SimulatedUsbPlatform,
  UsbDiskDevPathSchema,
  UsbDriveFilesystemType,
  UsbDriveStatus,
} from '@votingworks/usb-drive';
import {
  createMockPrinterHandler,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import {
  LogSource,
  mockBaseLogger,
  MockBaseLogger,
  MockLogger,
  mockLogger,
} from '@votingworks/logging';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import { Application } from 'express';
import { Server } from 'node:http';
import { Api, MachineMode, PeerApi } from '../src/index.js';
import { BaseStore } from '../src/types.js';
import { createWorkspace, Workspace } from '../src/util/workspace.js';
import { buildApp } from '../src/app.js';
import { buildPeerApp } from '../src/peer_app.js';
import { getMachineConfig } from '../src/machine_config.js';
import { getUserRole } from '../src/util/auth.js';

type ActualDirectory = string;
type MockFileTree = MockFile | MockDirectory | ActualDirectory;
type MockFile = Buffer;
interface MockDirectory {
  [name: string]: MockFileTree;
}

export function mockCastVoteRecordFileTree(
  electionDefinition: ElectionDefinition,
  mockDirectory: MockDirectory
): MockFileTree {
  const { election, ballotHash } = electionDefinition;
  return {
    [generateElectionBasedSubfolderName(election, ballotHash)]: {
      [SCANNER_RESULTS_FOLDER]: mockDirectory,
    },
  };
}

export function mockAuthStatus(
  auth: DippedSmartCardAuthApi,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  const mockGetAuthStatus = vi.mocked(auth.getAuthStatus);
  mockGetAuthStatus.mockResolvedValue(authStatus);
}

export function mockMachineLocked(auth: DippedSmartCardAuthApi): void {
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

export function saveTmpFile(
  contents: string | Buffer,
  extension?: string
): string {
  return makeTemporaryFile({ content: contents, postfix: extension });
}

// For now, returns electionId for client calls that still need it
export async function configureMachine(
  apiClient: grout.Client<Api>,
  auth: DippedSmartCardAuthApi,
  electionDefinition: ElectionDefinition,
  registeredVoterCounts?: ElectionRegisteredVoterCounts,
  systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): Promise<string> {
  mockSystemAdministratorAuth(auth);
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.METADATA]: JSON.stringify(LATEST_METADATA),
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(systemSettings),
    [ElectionPackageFileName.APP_STRINGS]: JSON.stringify({}),
    ...(registeredVoterCounts
      ? {
          [ElectionPackageFileName.REGISTERED_VOTER_COUNTS]: JSON.stringify(
            registeredVoterCounts
          ),
        }
      : {}),
  });
  const electionFilePath = saveTmpFile(electionPackage);
  const { electionId } = (
    await apiClient.configure({ electionFilePath })
  ).unsafeUnwrap();
  return electionId;
}

export function buildMockLogger(
  auth: DippedSmartCardAuthApi,
  store: BaseStore
): MockLogger {
  return mockLogger({
    source: LogSource.VxAdminService,
    getCurrentRole: () => getUserRole(auth, store),
    fn: vi.fn,
  });
}

export const devsdb = UsbDiskDevPathSchema.parse('/dev/sdb');

/**
 * Creates a mock USB drive (exFAT by default, `ext4` for backup drives),
 * attaches it, and waits until the app has detected and auto-mounted it.
 * Detection and mounting happen asynchronously (via a file watcher on the
 * {@link SimulatedUsbPlatform} state), so callers must await this before
 * exercising APIs that write to or read from the drive.
 */
export async function attachUsbDrive(
  apiClient: { getUsbDriveStatus: () => Promise<UsbDriveStatus> },
  usbPlatform: SimulatedUsbPlatform,
  contents?: MockFileTree,
  fstype: UsbDriveFilesystemType = 'exfat'
): Promise<void> {
  usbPlatform.createDrive({ diskPath: devsdb, fstype, contents });
  usbPlatform.insertDrive(devsdb);
  await vi.waitFor(
    async () => {
      expect((await apiClient.getUsbDriveStatus()).status).toEqual('mounted');
    },
    { timeout: 5_000 }
  );
}

export interface TestEnvironment {
  logger: MockLogger;
  auth: Mocked<DippedSmartCardAuthApi>;
  workspace: Workspace;
  app: Application;
  apiClient: grout.Client<Api>;
  peerApiClient: grout.Client<PeerApi>;
  peerLogger: MockBaseLogger;
  peerServer: Server;
  usbPlatform: SimulatedUsbPlatform;
  multiUsbDrive: MultiUsbDrive;
  mockPrinterHandler: MemoryPrinterHandler;
}

export function buildTestEnvironment(workspaceRoot?: string): TestEnvironment {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const resolvedWorkspaceRoot = workspaceRoot || makeTemporaryDirectory();
  const workspace = createWorkspace(
    resolvedWorkspaceRoot,
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace.store);
  const usbPlatform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const multiUsbDrive = detectMultiUsbDrive({ logger, platform: usbPlatform });
  const mockPrinterHandler = createMockPrinterHandler();
  let machineMode: MachineMode = 'host';
  const app = buildApp({
    auth,
    workspace,
    logger,
    multiUsbDrive,
    printer: mockPrinterHandler.printer,
    machineMode: {
      get: () => machineMode,
      set: (newMachineMode) => {
        machineMode = newMachineMode;
      },
    },
  });
  // port 0 will bind to a random, free port assigned by the OS
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const apiClient = grout.createClient<Api>({
    baseUrl,
  });

  const peerLogger = mockBaseLogger({ fn: vi.fn });
  const peerApp = buildPeerApp({
    workspace,
    logger: peerLogger,
    machineId: getMachineConfig().machineId,
  });
  const peerServer = peerApp.listen();
  const { port: peerPort } = peerServer.address() as AddressInfo;
  const peerApiClient = grout.createClient<PeerApi>({
    baseUrl: `http://localhost:${peerPort}/api`,
  });

  mockMachineLocked(auth);

  return {
    logger,
    auth,
    workspace,
    app,
    apiClient,
    peerApiClient,
    peerLogger,
    peerServer,
    usbPlatform,
    multiUsbDrive,
    mockPrinterHandler,
  };
}
