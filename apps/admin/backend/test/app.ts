import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
  mockOf,
  zipFile,
} from '@votingworks/test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth,
  ElectionDefinition,
  ElectionPackageFileName,
  SystemSettings,
} from '@votingworks/types';
import * as grout from '@votingworks/grout';
import { fakeLogger } from '@votingworks/logging';
import { AddressInfo } from 'net';
import { Buffer } from 'buffer';
import tmp, { tmpNameSync } from 'tmp';
import {
  generateElectionBasedSubfolderName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import { writeFileSync } from 'fs';
import { Api } from '../src';
import { createWorkspace } from '../src/util/workspace';
import { buildApp } from '../src/app';
import { deleteTmpFileAfterTestSuiteCompletes } from './cleanup';
import { TestTallyCache } from './tally_cache';

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
  const { election, electionHash } = electionDefinition;
  return {
    [generateElectionBasedSubfolderName(election, electionHash)]: {
      [SCANNER_RESULTS_FOLDER]: mockDirectory,
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
  systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS
): Promise<string> {
  mockSystemAdministratorAuth(auth);
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(systemSettings),
  });
  const electionFilePath = saveTmpFile(electionPackage);
  const { electionId } = (
    await apiClient.configure({ electionFilePath })
  ).unsafeUnwrap();
  return electionId;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildTestEnvironment(workspaceRoot?: string) {
  const logger = fakeLogger();
  const auth = buildMockDippedSmartCardAuth();
  const resolvedWorkspaceRoot =
    workspaceRoot ||
    (() => {
      const defaultWorkspaceRoot = tmp.dirSync().name;
      deleteTmpFileAfterTestSuiteCompletes(defaultWorkspaceRoot);
      return defaultWorkspaceRoot;
    })();
  const workspace = createWorkspace(resolvedWorkspaceRoot);
  const mockUsbDrive = createMockUsbDrive();
  const app = buildApp({
    auth,
    workspace,
    logger,
    usbDrive: mockUsbDrive.usbDrive,
    tallyCache: new TestTallyCache(),
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
    workspace,
    app,
    apiClient,
    mockUsbDrive,
  };
}
