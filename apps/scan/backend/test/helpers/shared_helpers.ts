import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { assert, ok } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import { fakeElectionManagerUser, mockOf } from '@votingworks/test-utils';
import { ElectionDefinition, PrecinctId } from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import { execSync } from 'child_process';
import fs from 'fs';
import { join } from 'path';
import tmp from 'tmp';
import waitForExpect from 'wait-for-expect';
import { Api } from '../../src/app';
import { PrecinctScannerInterpreter } from '../../src/interpret';
import {
  PrecinctScannerState,
  PrecinctScannerStatus,
  SheetInterpretation,
} from '../../src/types';
import { Usb } from '../../src/util/usb';

type MockFileTree = MockFile | MockDirectory;
type MockFile = Buffer;
interface MockDirectory {
  [name: string]: MockFileTree;
}

export interface MockUsb {
  insertUsbDrive(contents: MockFileTree): void;
  removeUsbDrive(): void;
  mock: jest.Mocked<Usb>;
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
