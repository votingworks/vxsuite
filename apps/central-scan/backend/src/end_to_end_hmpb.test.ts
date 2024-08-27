import getPort from 'get-port';
import {
  getCastVoteRecordExportDirectoryPaths,
  isTestReport,
  mockElectionPackageFileTree,
  readCastVoteRecordExport,
} from '@votingworks/backend';
import {
  asElectionDefinition,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import {
  CVR,
  DEFAULT_SYSTEM_SETTINGS,
  TEST_JURISDICTION,
} from '@votingworks/types';
import * as grout from '@votingworks/grout';
import {
  BooleanEnvironmentVariableName,
  convertCastVoteRecordVotesToTabulationVotes,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { EventEmitter } from 'events';
import { Application } from 'express';
import * as fs from 'fs-extra';
import { join } from 'path';
import request from 'supertest';
import { dirSync } from 'tmp';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import { fakeLogger, Logger } from '@votingworks/logging';
import { Server } from 'http';
import { fakeSessionExpiresAt } from '@votingworks/test-utils';
import { ok } from '@votingworks/basics';
import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { Api, buildCentralScannerApp } from './app';
import { start } from './server';

// mock SKIP_SCAN_ELECTION_HASH_CHECK to allow us to use old ballot image fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

jest.mock('./exec', () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/require-await
  default: async (): Promise<{ stdout: string; stderr: string }> => ({
    stdout: '',
    stderr: '',
  }),
  streamExecFile: (): unknown => {
    const child = new EventEmitter();

    Object.defineProperties(child, {
      stdout: { value: new EventEmitter() },
      stderr: { value: new EventEmitter() },
    });

    process.nextTick(() => child.emit('exit', 0));

    return child;
  },
}));

let auth: ReturnType<typeof buildMockDippedSmartCardAuth>;
let workspace: Workspace;
let scanner: MockScanner;
let mockUsbDrive: MockUsbDrive;
let importer: Importer;
let app: Application;
let logger: Logger;
let apiClient: grout.Client<Api>;
let server: Server;

beforeEach(async () => {
  const port = await getPort();
  auth = buildMockDippedSmartCardAuth();
  workspace = createWorkspace(dirSync().name);
  scanner = makeMockScanner();
  importer = new Importer({ workspace, scanner });
  mockUsbDrive = createMockUsbDrive();
  logger = fakeLogger();
  app = buildCentralScannerApp({
    auth,
    usbDrive: mockUsbDrive.usbDrive,
    allowedExportPatterns: ['/tmp/**'],
    importer,
    workspace,
    logger,
  });
  const baseUrl = `http://localhost:${port}/api`;
  apiClient = grout.createClient({
    baseUrl,
  });

  server = await start({
    app,
    logger,
    workspace,
    port,
  });
});

afterEach(async () => {
  importer.unconfigure();
  await fs.remove(workspace.path);
  featureFlagMock.resetFeatureFlags();
  server.close();
});

const jurisdiction = TEST_JURISDICTION;

test('going through the whole process works', async () => {
  const { election, electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: {
      role: 'election_manager',
      jurisdiction,
      electionHash: electionDefinition.electionHash,
    },
    sessionExpiresAt: fakeSessionExpiresAt(),
  });

  importer.configure(asElectionDefinition(election), jurisdiction);
  workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);

  // sample ballot election hash does not match election hash for this test
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_SCAN_ELECTION_HASH_CHECK
  );

  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree(
      electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(
        {
          ...DEFAULT_SYSTEM_SETTINGS,
          markThresholds: {
            definite: 0.08,
            marginal: 0.05,
          },
        }
      )
    )
  );
  const configureResult =
    await apiClient.configureFromElectionPackageOnUsbDrive();
  expect(configureResult.err()).toBeUndefined();
  expect(configureResult.isOk()).toEqual(true);
  expect(configureResult.ok()).toEqual(electionDefinition);

  // need to turn off test mode after election is loaded
  await apiClient.setTestMode({ testMode: false });

  mockUsbDrive.removeUsbDrive();
  // Confirm USB drive removed. Must poll the mock USB drive in order to
  // advance the state of the underlying mock function for rest of test.
  expect((await mockUsbDrive.usbDrive.status()).status).toEqual('no_drive');

  {
    // define the next scanner session
    const nextSession = scanner.withNextScannerSession();

    // scan some sample ballots
    nextSession.sheet([
      electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asFilePath(),
      electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asFilePath(),
    ]);

    nextSession.end();

    await request(app)
      .post('/central-scanner/scan/scanBatch')
      .expect(200)
      .then((response) => {
        expect(response.body).toEqual({
          status: 'ok',
          batchId: expect.any(String),
        });
      });

    await importer.waitForEndOfBatchOrScanningPause();

    // check the latest batch has the expected counts
    const status = await request(app)
      .get('/central-scanner/scan/status')
      .set('Accept', 'application/json')
      .expect(200);
    expect(JSON.parse(status.text).batches.length).toEqual(1);
    expect(JSON.parse(status.text).batches[0].count).toEqual(1);
  }

  {
    const mockUsbMountPoint = join(workspace.path, 'mock-usb');
    await fs.mkdir(mockUsbMountPoint, { recursive: true });
    mockUsbDrive.insertUsbDrive({});

    expect(
      await apiClient.exportCastVoteRecordsToUsbDrive({
        isMinimalExport: true,
      })
    ).toEqual(ok());

    const cvrReportDirectoryPath = (
      await getCastVoteRecordExportDirectoryPaths(mockUsbDrive.usbDrive)
    )[0];
    expect(cvrReportDirectoryPath).toContain('machine_000__');

    const { castVoteRecordExportMetadata, castVoteRecordIterator } = (
      await readCastVoteRecordExport(cvrReportDirectoryPath)
    ).unsafeUnwrap();
    const cvrs: CVR.CVR[] = (await castVoteRecordIterator.toArray()).map(
      (castVoteRecordResult) =>
        castVoteRecordResult.unsafeUnwrap().castVoteRecord
    );
    expect(cvrs).toHaveLength(1);
    const [cvr] = cvrs;
    expect(
      isTestReport(castVoteRecordExportMetadata.castVoteRecordReportMetadata)
    ).toBeFalsy();
    expect(cvr.BallotStyleId).toEqual('ballot-style-c43745c4');
    expect(cvr.BallotStyleUnitId).toEqual('town-id-00701-precinct');
    expect(cvr.CreatingDeviceId).toEqual('000');
    expect(cvr.BallotSheetId).toEqual('1');
    expect(cvr.vxBallotType).toEqual(CVR.vxBallotType.Precinct);
    expect(
      convertCastVoteRecordVotesToTabulationVotes(cvr.CVRSnapshot[0])
    ).toMatchSnapshot();
  }
}, 25_000);
