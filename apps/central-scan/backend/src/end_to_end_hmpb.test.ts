import getPort from 'get-port';
import {
  MockUsb,
  convertCastVoteRecordVotesToLegacyVotes,
  createBallotPackageZipArchive,
  createMockUsb,
  getCastVoteRecordReportImport,
  isTestReport,
  validateCastVoteRecordReportDirectoryStructure,
} from '@votingworks/backend';
import {
  asElectionDefinition,
  electionGridLayoutNewHampshireAmherstFixtures,
} from '@votingworks/fixtures';
import { CVR, TEST_JURISDICTION, unsafeParse } from '@votingworks/types';
import * as grout from '@votingworks/grout';
import {
  BooleanEnvironmentVariableName,
  CAST_VOTE_RECORD_REPORT_FILENAME,
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
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { Api, buildCentralScannerApp } from './central_scanner_app';
import { getCastVoteRecordReportPaths } from '../test/helpers/usb';
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
let mockUsb: MockUsb;
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
  mockUsb = createMockUsb();
  logger = fakeLogger();
  app = buildCentralScannerApp({
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

const jurisdiction = TEST_JURISDICTION;

test('going through the whole process works', async () => {
  jest.setTimeout(25000);
  const { election, electionDefinition } =
    electionGridLayoutNewHampshireAmherstFixtures;

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

  // sample ballot election hash does not match election hash for this test
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_SCAN_ELECTION_HASH_CHECK
  );

  mockUsb.insertUsbDrive({
    'ballot-packages': {
      'ballot-package.zip': await createBallotPackageZipArchive(
        electionGridLayoutNewHampshireAmherstFixtures.electionJson.toBallotPackage()
      ),
    },
  });
  const configureResult =
    await apiClient.configureFromBallotPackageOnUsbDrive();
  expect(configureResult.err()).toBeUndefined();
  expect(configureResult.isOk()).toEqual(true);
  expect(configureResult.ok()).toEqual(electionDefinition);

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
      electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asFilePath(),
      electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack.asFilePath(),
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
    expect(cvr.BallotStyleId).toEqual('card-number-3');
    expect(cvr.BallotStyleUnitId).toEqual('town-id-00701-precinct-id-');
    expect(cvr.CreatingDeviceId).toEqual('000');
    expect(cvr.BallotSheetId).toEqual('1');
    expect(cvr.vxBallotType).toEqual(CVR.vxBallotType.Precinct);
    expect(convertCastVoteRecordVotesToLegacyVotes(cvr.CVRSnapshot[0]))
      .toMatchInlineSnapshot(`
      Object {
        "County-Attorney-133f910f": Array [
          "Mary-Woolson-dc0b854a",
        ],
        "County-Commissioner-d6feed25": Array [
          "write-in-0",
        ],
        "County-Treasurer-87d25a31": Array [
          "write-in-0",
        ],
        "Executive-Councilor-bb22557f": Array [
          "write-in-0",
        ],
        "Governor-061a401b": Array [
          "Josiah-Bartlett-1bb99985",
        ],
        "Register-of-Deeds-a1278df2": Array [
          "John-Mann-b56bbdd3",
        ],
        "Register-of-Probate-a4117da8": Array [
          "Claire-Cutts-07a436e7",
        ],
        "Representative-in-Congress-24683b44": Array [
          "Richard-Coote-b9095636",
        ],
        "Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc": Array [
          "yes",
        ],
        "Sheriff-4243fe0b": Array [
          "Edward-Randolph-bf4c848a",
        ],
        "State-Representative-Hillsborough-District-37-f3bde894": Array [
          "Charles-H-Hersey-096286a4",
        ],
        "State-Representatives-Hillsborough-District-34-b1012d38": Array [
          "Samuel-Bell-17973275",
          "Samuel-Livermore-f927fef1",
          "Jacob-Freese-b5146505",
        ],
        "State-Senator-391381f8": Array [
          "James-Poole-db5ef4bd",
        ],
        "United-States-Senator-d3f1c75b": Array [
          "William-Preston-3778fcd5",
        ],
      }
    `);
  }
});
