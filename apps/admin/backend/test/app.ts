import {
  buildMockArtifactAuthenticator,
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
  mockOf,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, ElectionDefinition } from '@votingworks/types';
import * as grout from '@votingworks/grout';
import { assert } from '@votingworks/basics';
import { fakeLogger } from '@votingworks/logging';
import { AddressInfo } from 'net';
import { Buffer } from 'buffer';
import fs from 'fs';
import tmp from 'tmp';
import { execSync } from 'child_process';
import { join } from 'path';
import {
  generateElectionBasedSubfolderName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import { Api } from '../src';
import { createWorkspace } from '../src/util/workspace';
import { buildApp } from '../src/app';
import { Usb } from '../src/util/usb';
import { deleteTmpFileAfterTestSuiteCompletes } from './cleanup';

type ActualDirectory = string;
type MockFileTree = MockFile | MockDirectory | ActualDirectory;
type MockFile = Buffer;
interface MockDirectory {
  [name: string]: MockFileTree;
}

function writeMockFileTree(destinationPath: string, tree: MockFileTree): void {
  if (Buffer.isBuffer(tree)) {
    fs.writeFileSync(destinationPath, tree);
  } else if (typeof tree === 'string') {
    fs.cpSync(tree, destinationPath, { recursive: true });
  } else {
    if (!fs.existsSync(destinationPath)) fs.mkdirSync(destinationPath);
    for (const [name, child] of Object.entries(tree)) {
      // Sleep 1ms to ensure that each file is created with a distinct timestamp
      execSync('sleep 0.01');
      writeMockFileTree(join(destinationPath, name), child);
    }
  }
}

export function mockCastVoteRecordFileTree(
  electionDefinition: ElectionDefinition,
  mockDirectory: MockDirectory
): MockFileTree {
  const { election, electionHash } = electionDefinition;
  return {
    [SCANNER_RESULTS_FOLDER]: {
      [generateElectionBasedSubfolderName(election, electionHash)]:
        mockDirectory,
    },
  };
}

interface MockUsb {
  insertUsbDrive(contents: MockFileTree): void;
  removeUsbDrive(): void;
  usb: jest.Mocked<Usb>;
}

/**
 * Creates a mock of the Usb interface to USB drives. Simulates inserting and
 * removing a USB containing a tree of files and directories. Uses a temporary
 * directory on the filesystem to simulate the USB drive.
 */
export function createMockUsb(): MockUsb {
  let mockUsbTmpDir: tmp.DirResult | undefined;

  const usb: jest.Mocked<Usb> = {
    getUsbDrives: jest.fn().mockImplementation(() => {
      if (mockUsbTmpDir) {
        return Promise.resolve([
          {
            deviceName: 'mock-usb-drive',
            mountPoint: mockUsbTmpDir.name,
          },
        ]);
      }
      return Promise.resolve([]);
    }),
  };

  return {
    usb,

    insertUsbDrive(contents: MockFileTree) {
      assert(!mockUsbTmpDir, 'Mock USB drive already inserted');
      mockUsbTmpDir = tmp.dirSync({ unsafeCleanup: true });
      writeMockFileTree(mockUsbTmpDir.name, contents);
    },

    removeUsbDrive() {
      assert(mockUsbTmpDir, 'No mock USB drive to remove');
      mockUsbTmpDir.removeCallback();
      mockUsbTmpDir = undefined;
    },
  };
}

export function mockAuthStatus(
  auth: DippedSmartCardAuthApi,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  const mockGetAuthStatus = mockOf(auth.getAuthStatus);
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
    user: fakeSystemAdministratorUser(),
    sessionExpiresAt: fakeSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  });
}

export function mockElectionManagerAuth(
  auth: DippedSmartCardAuthApi,
  electionHash: string
): void {
  mockAuthStatus(auth, {
    status: 'logged_in',
    user: fakeElectionManagerUser({ electionHash }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  });
}

// For now, returns electionId for client calls that still need it
export async function configureMachine(
  apiClient: grout.Client<Api>,
  auth: DippedSmartCardAuthApi,
  electionDefinition: ElectionDefinition
): Promise<string> {
  mockSystemAdministratorAuth(auth);
  const { electionData } = electionDefinition;
  const configureResult = await apiClient.configure({
    electionData,
  });
  assert(configureResult.isOk());
  return configureResult.ok().electionId;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildTestEnvironment(workspaceRoot?: string) {
  const logger = fakeLogger();
  const auth = buildMockDippedSmartCardAuth();
  const artifactAuthenticator = buildMockArtifactAuthenticator();
  const resolvedWorkspaceRoot =
    workspaceRoot ||
    (() => {
      const defaultWorkspaceRoot = tmp.dirSync().name;
      deleteTmpFileAfterTestSuiteCompletes(defaultWorkspaceRoot);
      return defaultWorkspaceRoot;
    })();
  const workspace = createWorkspace(resolvedWorkspaceRoot);
  const mockUsb = createMockUsb();
  const app = buildApp({
    auth,
    artifactAuthenticator,
    workspace,
    logger,
    usb: mockUsb.usb,
  });
  // port 0 will bind to a random, free port assigned by the OS
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const apiClient = grout.createClient<Api>({
    baseUrl,
  });

  mockMachineLocked(auth);

  return {
    logger,
    auth,
    artifactAuthenticator,
    workspace,
    app,
    apiClient,
    mockUsb,
  };
}
