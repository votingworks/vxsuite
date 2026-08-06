import { expect, vi } from 'vitest';
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
import tmp, { tmpNameSync } from 'tmp';
import {
  generateElectionBasedSubfolderName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import {
  detectMultiUsbDrive,
  SimulatedUsbPlatform,
  UsbDiskDevPathSchema,
  UsbDriveStatus,
} from '@votingworks/usb-drive';
import { writeFileSync } from 'node:fs';
import { createMockPrinterHandler } from '@votingworks/printing';
import {
  LogSource,
  mockBaseLogger,
  MockLogger,
  mockLogger,
} from '@votingworks/logging';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { Api, PeerApi } from '../src/index.js';
import { BaseStore } from '../src/types.js';
import { createWorkspace } from '../src/util/workspace.js';
import { buildApp } from '../src/app.js';
import { buildPeerApp } from '../src/peer_app.js';
import { getMachineConfig } from '../src/machine_config.js';
import { deleteTmpFileAfterTestSuiteCompletes } from './cleanup.js';
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
  const tmpFilePath = tmpNameSync({ postfix: extension });
  writeFileSync(tmpFilePath, contents);
  deleteTmpFileAfterTestSuiteCompletes(tmpFilePath);
  return tmpFilePath;
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
 * Creates a FAT32 mock USB drive, attaches it, and waits until the app has
 * detected and auto-mounted it. Detection and mounting happen asynchronously
 * (via a file watcher on the {@link SimulatedUsbPlatform} state), so callers
 * must await this before exercising APIs that write to or read from the drive.
 */
export async function attachUsbDrive(
  apiClient: { getUsbDriveStatus: () => Promise<UsbDriveStatus> },
  usbPlatform: SimulatedUsbPlatform,
  contents?: MockFileTree
): Promise<void> {
  usbPlatform.createDrive({ diskPath: devsdb, fstype: 'fat32', contents });
  usbPlatform.insertDrive(devsdb);
  await vi.waitFor(
    async () => {
      expect((await apiClient.getUsbDriveStatus()).status).toEqual('mounted');
    },
    { timeout: 5_000 }
  );
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildTestEnvironment(workspaceRoot?: string) {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const resolvedWorkspaceRoot =
    workspaceRoot ||
    (() => {
      const defaultWorkspaceRoot = tmp.dirSync().name;
      deleteTmpFileAfterTestSuiteCompletes(defaultWorkspaceRoot);
      return defaultWorkspaceRoot;
    })();
  const workspace = createWorkspace(
    resolvedWorkspaceRoot,
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace.store);
  const usbPlatform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const multiUsbDrive = detectMultiUsbDrive({ logger, platform: usbPlatform });
  const mockPrinterHandler = createMockPrinterHandler();
  const app = buildApp({
    auth,
    workspace,
    logger,
    multiUsbDrive,
    printer: mockPrinterHandler.printer,
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
