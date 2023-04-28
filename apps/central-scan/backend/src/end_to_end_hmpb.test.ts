import getPort from 'get-port';
import {
  MockUsb,
  convertCastVoteRecordVotesToLegacyVotes,
  createMockUsb,
  getCastVoteRecordReportImport,
  isTestReport,
  validateCastVoteRecordReportDirectoryStructure,
} from '@votingworks/backend';
import { CVR, unsafeParse } from '@votingworks/types';
import * as grout from '@votingworks/grout';
import {
  BooleanEnvironmentVariableName,
  CAST_VOTE_RECORD_REPORT_FILENAME,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import { Application } from 'express';
import * as fs from 'fs-extra';
import { join } from 'path';
import request from 'supertest';
import { dirSync } from 'tmp';
import {
  buildMockDippedSmartCardAuth,
  DEV_JURISDICTION,
} from '@votingworks/auth';
import { fakeLogger, Logger } from '@votingworks/logging';
import { Server } from 'http';
import { fakeSessionExpiresAt } from '@votingworks/test-utils';
import * as stateOfHamilton from '../test/fixtures/state-of-hamilton';
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { Api, buildCentralScannerApp } from './central_scanner_app';
import { getCastVoteRecordReportPaths } from '../test/helpers/usb';
import { start } from './server';

const electionFixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/state-of-hamilton'
);

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
let mockUsb: MockUsb;
let importer: Importer;
let app: Application;
let logger: Logger;
let apiClient: grout.Client<Api>;
let server: Server;

beforeEach(async () => {
  const port = await getPort();
  auth = buildMockDippedSmartCardAuth();
  workspace = await createWorkspace(dirSync().name);
  scanner = makeMockScanner();
  importer = new Importer({ workspace, scanner });
  mockUsb = createMockUsb();
  logger = fakeLogger();
  app = await buildCentralScannerApp({
    auth,
    usb: mockUsb.mock,
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

const jurisdiction = DEV_JURISDICTION;

test('going through the whole process works', async () => {
  jest.setTimeout(25000);
  const { electionDefinition } = stateOfHamilton;

  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: {
      role: 'election_manager',
      jurisdiction,
      electionHash: electionDefinition.electionHash,
    },
    sessionExpiresAt: fakeSessionExpiresAt(),
  });

  await importer.restoreConfig();

  // sample ballot election hash does not match election hash for this test
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_SCAN_ELECTION_HASH_CHECK
  );

  const fileContents = await fs.readFile(stateOfHamilton.ballotPackage);

  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'ballot-package.zip': Buffer.from(fileContents),
    },
  });
  const configureResult =
    await apiClient.configureFromBallotPackageOnUsbDrive();
  expect(configureResult.err()).toBeUndefined();
  expect(configureResult.isOk()).toEqual(true);
  expect(configureResult.ok()).toEqual(stateOfHamilton.electionDefinition);

  // need to turn off test mode after election is loaded
  await request(app)
    .patch('/central-scanner/config/testMode')
    .send({ testMode: false })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  mockUsb.removeUsbDrive();

  {
    // define the next scanner session
    const nextSession = scanner.withNextScannerSession();

    // scan some sample ballots
    nextSession.sheet([
      join(electionFixturesRoot, 'filled-in-dual-language-p1.jpg'),
      join(electionFixturesRoot, 'filled-in-dual-language-p2.jpg'),
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
    mockUsb.insertUsbDrive({});

    await request(app)
      .post('/central-scanner/scan/export-to-usb-drive')
      .set('Accept', 'application/json')
      .expect(200);

    const [usbDrive] = await mockUsb.mock.getUsbDrives();
    const cvrReportDirectoryPath = getCastVoteRecordReportPaths(usbDrive)[0];
    expect(cvrReportDirectoryPath).toContain('machine_000__1_ballot__');

    // exported report directory appears valid
    expect(
      (
        await validateCastVoteRecordReportDirectoryStructure(
          cvrReportDirectoryPath
        )
      ).isOk()
    ).toBeTruthy();

    const castVoteRecordReportImportResult =
      await getCastVoteRecordReportImport(
        join(cvrReportDirectoryPath, CAST_VOTE_RECORD_REPORT_FILENAME)
      );
    expect(castVoteRecordReportImportResult.isOk()).toBeTruthy();
    const castVoteRecordReportImport =
      castVoteRecordReportImportResult.assertOk('test');
    const cvrs = await castVoteRecordReportImport.CVR.map((unparsed) =>
      unsafeParse(CVR.CVRSchema, unparsed)
    ).toArray();
    expect(cvrs).toHaveLength(1);
    const [cvr] = cvrs;
    expect(isTestReport(castVoteRecordReportImport)).toBeFalsy();
    expect(cvr.BallotStyleId).toEqual('12');
    expect(cvr.BallotStyleUnitId).toEqual('23');
    expect(cvr.CreatingDeviceId).toEqual('000');
    expect(cvr.BallotSheetId).toEqual('1');
    expect(cvr.vxBallotType).toEqual(CVR.vxBallotType.Precinct);
    expect(
      convertCastVoteRecordVotesToLegacyVotes(cvr.CVRSnapshot[0])
    ).toMatchObject({
      governor: ['windbeck'],
      'lieutenant-governor': ['davis'],
      president: ['barchi-hallaren'],
      'representative-district-6': ['schott'],
      'secretary-of-state': ['talarico'],
      senator: ['brown'],
      'state-assembly-district-54': ['keller'],
      'state-senator-district-31': [],
    });
  }
});
