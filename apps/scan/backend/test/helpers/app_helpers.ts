import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { fakeElectionManagerUser, mockOf } from '@votingworks/test-utils';
import * as grout from '@votingworks/grout';
import { Application } from 'express';
import { Buffer } from 'buffer';
import { ElectionDefinition, PrecinctId } from '@votingworks/types';
import waitForExpect from 'wait-for-expect';
import { fakeLogger, Logger } from '@votingworks/logging';
import {
  MockScannerClient,
  MockScannerClientOptions,
  ScannerClient,
} from '@votingworks/plustek-scanner';
import tmp from 'tmp';
import {
  electionFamousNames2021Fixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { join } from 'path';
import { AddressInfo } from 'net';
import fs from 'fs';
import { execSync } from 'child_process';
import { assert, deferred, ok, Result } from '@votingworks/basics';
import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import { Server } from 'http';
import { buildApp, Api } from '../../src/app';
import {
  createPrecinctScannerStateMachine,
  Delays,
} from '../../src/state_machine';
import {
  createInterpreter,
  PrecinctScannerInterpreter,
} from '../../src/interpret';
import { createWorkspace, Workspace } from '../../src/util/workspace';
import { Usb } from '../../src/util/usb';
import {
  PrecinctScannerState,
  PrecinctScannerStatus,
  SheetInterpretation,
} from '../../src/types';

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

interface MockUsb {
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

export async function withApp(
  {
    delays = {},
    mockPlustekOptions = {},
    preconfiguredWorkspace,
  }: {
    delays?: Partial<Delays>;
    mockPlustekOptions?: Partial<MockScannerClientOptions>;
    preconfiguredWorkspace?: Workspace;
  },
  fn: (context: {
    apiClient: grout.Client<Api>;
    app: Application;
    mockAuth: InsertedSmartCardAuthApi;
    mockPlustek: MockScannerClient;
    workspace: Workspace;
    mockUsb: MockUsb;
    logger: Logger;
    interpreter: PrecinctScannerInterpreter;
    server: Server;
  }) => Promise<void>
): Promise<void> {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const logger = fakeLogger();
  const workspace =
    preconfiguredWorkspace ?? (await createWorkspace(tmp.dirSync().name));
  const mockPlustek = new MockScannerClient({
    toggleHoldDuration: 100,
    passthroughDuration: 100,
    ...mockPlustekOptions,
  });
  const deferredConnect = deferred<void>();
  async function createPlustekClient(): Promise<Result<ScannerClient, Error>> {
    await mockPlustek.connect();
    await deferredConnect.promise;
    return ok(mockPlustek);
  }
  const interpreter = createInterpreter();
  const precinctScannerMachine = createPrecinctScannerStateMachine({
    createPlustekClient,
    workspace,
    interpreter,
    logger,
    delays: {
      DELAY_RECONNECT: 100,
      DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: 100,
      DELAY_ACCEPTED_RESET_TO_NO_PAPER: 200,
      DELAY_PAPER_STATUS_POLLING_INTERVAL: 50,
      ...delays,
    },
  });
  const mockUsb = createMockUsb();
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

  await expectStatus(apiClient, { state: 'connecting' });
  deferredConnect.resolve();
  await waitForStatus(apiClient, { state: 'no_paper' });

  try {
    await fn({
      apiClient,
      app,
      mockAuth,
      mockPlustek,
      workspace,
      mockUsb,
      logger,
      interpreter,
      server,
    });
  } finally {
    const { promise, resolve, reject } = deferred<void>();
    server.close((error) => (error ? reject(error) : resolve()));
    await promise;
    void mockPlustek.stop();
    workspace.reset();
  }
}

export const ballotImages = {
  completeHmpb: [
    electionFamousNames2021Fixtures.handMarkedBallotCompletePage1.asFilePath(),
    electionFamousNames2021Fixtures.handMarkedBallotCompletePage2.asFilePath(),
  ],
  completeBmd: [
    electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(),
    electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
  ],
  unmarkedHmpb: [
    electionFamousNames2021Fixtures.handMarkedBallotUnmarkedPage1.asFilePath(),
    electionFamousNames2021Fixtures.handMarkedBallotUnmarkedPage2.asFilePath(),
  ],
  wrongElection: [
    // A BMD ballot front from a different election
    sampleBallotImages.sampleBatch1Ballot1.asFilePath(),
    // Blank BMD ballot back
    electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
  ],
  // The interpreter expects two different image files, so we use two
  // different blank page images
  blankSheet: [
    sampleBallotImages.blankPage.asFilePath(),
    // Blank BMD ballot back
    electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
  ],
} as const;

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

/**
 * configureApp is a testing convenience function that handles some common configuration of the VxScan app.
 * @param apiClient - a VxScan API client
 * @param mockUsb - a mock USB
 * @param options - an object containing optional arguments
 * @param options.mockAuth - a mock InsertedSmartCardAuthApi. Passing this will automatically
 *                           create a mock that auths the user as an election manager of the same
 *                           election defined in the ballot package.
 */
export async function configureApp(
  apiClient: grout.Client<Api>,
  mockUsb: MockUsb,
  {
    addTemplates = false,
    precinctId,
    mockAuth,
  }: {
    addTemplates?: boolean;
    precinctId?: PrecinctId;
    mockAuth?: InsertedSmartCardAuthApi;
  } = {
    addTemplates: false,
  }
): Promise<void> {
  if (mockAuth) {
    mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
      Promise.resolve({
        status: 'logged_in',
        user: fakeElectionManagerUser(
          electionFamousNames2021Fixtures.electionDefinition
        ),
      })
    );
  }

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

/**
 * Interpretation is generally the slowest part of tests in this file. To speed
 * up a test, you can use this function to mock interpretation. It should only
 * be used when:
 * - The test isn't meant to check that interpretation works correctly. There
 *   should already be another test that covers the same interpretation case.
 * - The test doesn't check the CVR export at the end. The interpreter stores
 *   the ballot images which are used in the CVR, and mocking will forgo that
 *   logic.
 * - The test doesn't depend on the actual page interpretations. This function
 *   adds fake page interpretations that don't actually match the passed in
 *   ballot interpretation (because the state machine doesn't actually use those
 *   page interpretations, they are just stored for the CVR).
 */
export function mockInterpretation(
  interpreter: PrecinctScannerInterpreter,
  interpretation: SheetInterpretation
): void {
  jest.spyOn(interpreter, 'interpret').mockResolvedValue(
    ok({
      ...interpretation,
      pages: [
        {
          interpretation: { type: 'BlankPage' },
          originalFilename: 'fake_original_filename',
          normalizedFilename: 'fake_normalized_filename',
        },
        {
          interpretation: { type: 'BlankPage' },
          originalFilename: 'fake_original_filename',
          normalizedFilename: 'fake_normalized_filename',
        },
      ],
    })
  );
}
