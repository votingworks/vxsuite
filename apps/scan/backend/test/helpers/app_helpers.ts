import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import { assert, ok } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import { fakeLogger, Logger } from '@votingworks/logging';
import { Buffer } from 'buffer';
import { execSync } from 'child_process';
import { Application } from 'express';
import fs from 'fs';
import { AddressInfo } from 'net';
import { join } from 'path';
import tmp from 'tmp';
import { ElectionDefinition, PrecinctId } from '@votingworks/types';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import waitForExpect from 'wait-for-expect';
import { Api, buildApp } from '../../src/app';
import {
  createInterpreter,
  PrecinctScannerInterpreter,
} from '../../src/interpret';
import { Usb } from '../../src/util/usb';
import { createWorkspace, Workspace } from '../../src/util/workspace';
import {
  PrecinctScannerState,
  PrecinctScannerStateMachine,
  PrecinctScannerStatus,
} from '../../src';

type MockFileTree = MockFile | MockDirectory;
type MockFile = Buffer;
interface MockDirectory {
  [name: string]: MockFileTree;
}

function writeMockFileTree(destinationPath: string, tree: MockFileTree): void {
  if (Buffer.isBuffer(tree)) {
    fs.writeFileSync(destinationPath, tree);
  } else {
    if (!fs.existsSync(destinationPath)) fs.mkdirSync(destinationPath);
    for (const [name, child] of Object.entries(tree)) {
      // Sleep 1ms to ensure that each file is created with a distinct timestamp
      execSync('sleep 0.01');
      writeMockFileTree(join(destinationPath, name), child);
    }
  }
}

export interface MockUsb {
  insertUsbDrive(contents: MockFileTree): void;
  removeUsbDrive(): void;
  mock: jest.Mocked<Usb>;
}

/**
 * Creates a mock of the Usb interface to USB drives. Simulates inserting and
 * removing a USB containing a tree of files and directories. Uses a temporary
 * directory on the filesystem to simulate the USB drive.
 */
export function createMockUsb(): MockUsb {
  let mockUsbTmpDir: tmp.DirResult | undefined;

  const mock: jest.Mocked<Usb> = {
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
    mock,

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

export async function expectStatus(
  apiClient: grout.Client<Api>,
  expectedStatus: {
    state: PrecinctScannerState;
  } & Partial<PrecinctScannerStatus>
): Promise<void> {
  const status = await apiClient.getScannerStatus();
  expect(status).toEqual({
    ballotsCounted: 0,
    // TODO canUnconfigure should probably not be part of this endpoint - it's
    // only needed on the admin screen
    canUnconfigure: !expectedStatus?.ballotsCounted,
    error: undefined,
    interpretation: undefined,
    ...expectedStatus,
  });
}

export async function waitForStatus(
  apiClient: grout.Client<Api>,
  status: {
    state: PrecinctScannerState;
  } & Partial<PrecinctScannerStatus>
): Promise<void> {
  await waitForExpect(async () => {
    await expectStatus(apiClient, status);
  }, 1_000);
}

/**
 * Creates a mock `PrecinctScannerStateMachine` with no default behavior.
 */
export function createPrecinctScannerStateMachineMock(): jest.Mocked<PrecinctScannerStateMachine> {
  return {
    status: jest.fn().mockRejectedValue(new Error('not implemented')),
    scan: jest.fn().mockRejectedValue(new Error('not implemented')),
    accept: jest.fn().mockRejectedValue(new Error('not implemented')),
    return: jest.fn().mockRejectedValue(new Error('not implemented')),
    stop: jest.fn().mockRejectedValue(new Error('not implemented')),
    calibrate: jest.fn().mockRejectedValue(new Error('not implemented')),
  };
}

export async function withApp(
  options: {
    precinctScannerMachine?: PrecinctScannerStateMachine;
    preconfiguredWorkspace?: Workspace;
    mockAuth?: InsertedSmartCardAuthApi;
    mockUsb?: MockUsb;
    logger?: Logger;
    interpreter?: PrecinctScannerInterpreter;
  },
  callback: (parameter: {
    apiClient: grout.Client<Api>;
    app: Application;
    mockAuth: InsertedSmartCardAuthApi;
    workspace: Workspace;
    mockUsb: MockUsb;
    logger: Logger;
    interpreter: PrecinctScannerInterpreter;
  }) => Promise<void>
): Promise<void> {
  const { stopApp, ...rest } = await createApp(options);
  try {
    await callback(rest);
  } finally {
    stopApp();
  }
}

export async function createApp({
  precinctScannerMachine = createPrecinctScannerStateMachineMock(),
  preconfiguredWorkspace,
  mockAuth = buildMockInsertedSmartCardAuth(),
  mockUsb = createMockUsb(),
  logger = fakeLogger(),
  interpreter = createInterpreter(),
}: {
  precinctScannerMachine?: PrecinctScannerStateMachine;
  preconfiguredWorkspace?: Workspace;
  mockAuth?: InsertedSmartCardAuthApi;
  mockUsb?: MockUsb;
  logger?: Logger;
  interpreter?: PrecinctScannerInterpreter;
} = {}): Promise<{
  apiClient: grout.Client<Api>;
  app: Application;
  mockAuth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  mockUsb: MockUsb;
  logger: Logger;
  interpreter: PrecinctScannerInterpreter;
  stopApp: () => void;
}> {
  const workspace =
    preconfiguredWorkspace ?? (await createWorkspace(tmp.dirSync().name));
  const app = buildApp(
    mockAuth,
    precinctScannerMachine,
    interpreter,
    workspace,
    mockUsb.mock,
    logger
  );

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;
  const apiClient = grout.createClient<Api>({ baseUrl });

  return {
    apiClient,
    app,
    mockAuth,
    workspace,
    mockUsb,
    logger,
    interpreter,
    stopApp: () => server.close(),
  };
}

// Loading of HMPB templates is slow, so in some tests we want to skip it by
// removing the templates from the ballot package.
export function createBallotPackageWithoutTemplates(
  electionDefinition: ElectionDefinition
): Buffer {
  const dirPath = tmp.dirSync().name;
  const zipPath = `${dirPath}.zip`;
  fs.writeFileSync(
    join(dirPath, 'election.json'),
    electionDefinition.electionData
  );
  fs.writeFileSync(
    join(dirPath, 'manifest.json'),
    JSON.stringify({ ballots: [] })
  );
  execSync(`zip -j ${zipPath} ${dirPath}/*`);
  return fs.readFileSync(zipPath);
}

const electionFamousNames2021WithoutTemplatesBallotPackageBuffer =
  createBallotPackageWithoutTemplates(
    electionFamousNames2021Fixtures.electionDefinition
  );

export async function configureApp(
  apiClient: grout.Client<Api>,
  mockUsb: MockUsb,
  {
    addTemplates = false,
    precinctId,
  }: {
    addTemplates?: boolean;
    precinctId?: PrecinctId;
  } = {
    addTemplates: false,
  }
): Promise<void> {
  const ballotPackageBuffer = addTemplates
    ? electionFamousNames2021Fixtures.ballotPackage.asBuffer()
    : electionFamousNames2021WithoutTemplatesBallotPackageBuffer;
  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'test-ballot-package.zip': ballotPackageBuffer,
    },
  });
  expect(await apiClient.configureFromBallotPackageOnUsbDrive()).toEqual(ok());

  await apiClient.setPrecinctSelection({
    precinctSelection: precinctId
      ? singlePrecinctSelectionFor(precinctId)
      : ALL_PRECINCTS_SELECTION,
  });
  await apiClient.setTestMode({ isTestMode: false });
  await apiClient.setPollsState({ pollsState: 'polls_open' });
}
