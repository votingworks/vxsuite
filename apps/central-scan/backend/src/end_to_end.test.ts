import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import {
  convertCastVoteRecordVotesToLegacyVotes,
  createMockUsb,
  getCastVoteRecordReportImport,
  isTestReport,
  MockUsb,
  validateCastVoteRecordReportDirectoryStructure,
} from '@votingworks/backend';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { CVR, TEST_JURISDICTION, unsafeParse } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  CAST_VOTE_RECORD_REPORT_FILENAME,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { Application } from 'express';
import * as fsExtra from 'fs-extra';
import { Server } from 'http';
import * as path from 'path';
import * as grout from '@votingworks/grout';
import request from 'supertest';
import { dirSync } from 'tmp';
import { fakeLogger, Logger } from '@votingworks/logging';
import { fakeSessionExpiresAt } from '@votingworks/test-utils';
import getPort from 'get-port';
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { Api, buildCentralScannerApp } from './central_scanner_app';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { getCastVoteRecordReportPaths } from '../test/helpers/usb';
import { start } from './server';

// we need more time for ballot interpretation
jest.setTimeout(20000);

// mock SKIP_SCAN_ELECTION_HASH_CHECK to allow us to use old ballot image fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

let app: Application;
let auth: ReturnType<typeof buildMockDippedSmartCardAuth>;
let importer: Importer;
let mockUsb: MockUsb;
let workspace: Workspace;
let scanner: MockScanner;
let logger: Logger;
let apiClient: grout.Client<Api>;
let server: Server;

beforeEach(async () => {
  const port = await getPort();
  auth = buildMockDippedSmartCardAuth();
  scanner = makeMockScanner();
  workspace = createWorkspace(dirSync().name);
  importer = new Importer({
    workspace,
    scanner,
  });
  logger = fakeLogger();
  mockUsb = createMockUsb();
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
  await fsExtra.remove(workspace.path);
  featureFlagMock.resetFeatureFlags();
  server.close();
});

const jurisdiction = TEST_JURISDICTION;

test('going through the whole process works', async () => {
  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: {
      role: 'election_manager',
      jurisdiction,
      electionHash: 'abc',
    },
    sessionExpiresAt: fakeSessionExpiresAt(),
  });

  // try export before configure
  await request(app)
    .post('/central-scanner/scan/export-to-usb-drive')
    .set('Accept', 'application/json')
    .expect(400);

  importer.configure(
    electionFamousNames2021Fixtures.electionDefinition,
    jurisdiction
  );

  await apiClient.setTestMode({ testMode: true });

  {
    // define the next scanner session & scan some sample ballots
    scanner
      .withNextScannerSession()
      .sheet([
        electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(),
        electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
      ])
      .end();
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

    // check the status
    const status = await request(app)
      .get('/central-scanner/scan/status')
      .set('Accept', 'application/json')
      .expect(200);

    expect(JSON.parse(status.text).batches[0].count).toEqual(1);
  }

  {
    mockUsb.insertUsbDrive({});

    await request(app)
      .post('/central-scanner/scan/export-to-usb-drive')
      .set('Accept', 'application/json')
      .expect(200);

    const [usbDrive] = await mockUsb.mock.getUsbDrives();
    const cvrReportDirectoryPath = getCastVoteRecordReportPaths(usbDrive)[0];
    expect(cvrReportDirectoryPath).toContain('TEST__machine_000__1_ballot__');

    // check that exported report directory appears valid
    expect(
      (
        await validateCastVoteRecordReportDirectoryStructure(
          cvrReportDirectoryPath
        )
      ).isOk()
    ).toBeTruthy();

    const castVoteRecordReportImportResult =
      await getCastVoteRecordReportImport(
        path.join(cvrReportDirectoryPath, CAST_VOTE_RECORD_REPORT_FILENAME)
      );
    const castVoteRecordReportImport =
      castVoteRecordReportImportResult.assertOk('test');
    expect(isTestReport(castVoteRecordReportImport)).toBeTruthy();
    const cvrs = await castVoteRecordReportImport.CVR.map((unparsed) =>
      unsafeParse(CVR.CVRSchema, unparsed)
    ).toArray();
    expect(
      cvrs.map((cvr) =>
        convertCastVoteRecordVotesToLegacyVotes(cvr.CVRSnapshot[0])
      )
    ).toEqual([
      expect.objectContaining({
        mayor: ['sherlock-holmes'],
        controller: ['winston-churchill'],
      }),
    ]);
  }

  {
    // delete all batches
    const status = await request(app)
      .get('/central-scanner/scan/status')
      .set('Accept', 'application/json')
      .expect(200);
    for (const { id } of JSON.parse(status.text).batches) {
      await request(app)
        .post(`/api/deleteBatch`)
        .send({ batchId: id })
        .set('Accept', 'application/json')
        .expect(200);
    }
  }

  {
    // expect that we have no batches
    const status = await request(app)
      .get('/central-scanner/scan/status')
      .set('Accept', 'application/json')
      .expect(200);
    expect(JSON.parse(status.text).batches).toEqual([]);
  }

  // re-export with no CVRs
  await request(app)
    .post('/central-scanner/scan/export-to-usb-drive')
    .set('Accept', 'application/json')
    .expect(200);

  const [usbDrive] = await mockUsb.mock.getUsbDrives();
  const cvrReportDirectoryPaths = getCastVoteRecordReportPaths(usbDrive);
  expect(cvrReportDirectoryPaths).toHaveLength(2);
  const cvrReportDirectoryPath = cvrReportDirectoryPaths[0];
  const castVoteRecordReportImportResult = await getCastVoteRecordReportImport(
    path.join(cvrReportDirectoryPath, CAST_VOTE_RECORD_REPORT_FILENAME)
  );

  // there should be no CVRs in the file.
  expect(
    await castVoteRecordReportImportResult.assertOk('test').CVR.count()
  ).toEqual(0);

  // clean up
  await request(app).delete('/central-scanner/config/election');
});
