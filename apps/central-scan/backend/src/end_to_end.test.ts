import {
  DEV_JURISDICTION,
  buildMockDippedSmartCardAuth,
} from '@votingworks/auth';
import {
  convertCastVoteRecordVotesToLegacyVotes,
  createMockUsb,
  getCastVoteRecordReportImport,
  MockUsb,
  validateCastVoteRecordReportDirectoryStructure,
} from '@votingworks/backend';
import {
  asElectionDefinition,
  electionSample as election,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { CVR, unsafeParse } from '@votingworks/types';
import { CAST_VOTE_RECORD_REPORT_FILENAME } from '@votingworks/utils';
import { Application } from 'express';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import request from 'supertest';
import { dirSync } from 'tmp';
import { fakeLogger, Logger } from '@votingworks/logging';
import { fakeSessionExpiresAt } from '@votingworks/test-utils';
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { buildCentralScannerApp } from './central_scanner_app';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { getCastVoteRecordReportPaths } from '../test/helpers/usb';

// we need more time for ballot interpretation
jest.setTimeout(20000);

let app: Application;
let auth: ReturnType<typeof buildMockDippedSmartCardAuth>;
let importer: Importer;
let mockUsb: MockUsb;
let workspace: Workspace;
let scanner: MockScanner;
let logger: Logger;

beforeEach(async () => {
  auth = buildMockDippedSmartCardAuth();
  scanner = makeMockScanner();
  workspace = await createWorkspace(dirSync().name);
  importer = new Importer({
    workspace,
    scanner,
  });
  logger = fakeLogger();
  mockUsb = createMockUsb();
  app = await buildCentralScannerApp({
    auth,
    usb: mockUsb.mock,
    allowedExportPatterns: ['/tmp/**'],
    importer,
    workspace,
    logger,
  });
});

afterEach(async () => {
  await fsExtra.remove(workspace.path);
});

const jurisdiction = DEV_JURISDICTION;

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

  await request(app)
    .patch('/central-scanner/config/election')
    .send(asElectionDefinition(election).electionData)
    .set('Content-Type', 'application/octet-stream')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  // sample ballot election hash does not match election hash for this test
  await request(app)
    .patch('/central-scanner/config/skipElectionHashCheck')
    .send({ skipElectionHashCheck: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  await request(app)
    .patch('/central-scanner/config/testMode')
    .send({ testMode: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  {
    // define the next scanner session & scan some sample ballots
    scanner
      .withNextScannerSession()
      .sheet([
        sampleBallotImages.sampleBatch1Ballot1.asFilePath(),
        sampleBallotImages.blankPage.asFilePath(),
      ])
      .sheet([
        sampleBallotImages.sampleBatch1Ballot2.asFilePath(),
        sampleBallotImages.blankPage.asFilePath(),
      ])
      .sheet([
        sampleBallotImages.sampleBatch1Ballot3.asFilePath(),
        sampleBallotImages.blankPage.asFilePath(),
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

    expect(JSON.parse(status.text).batches[0].count).toEqual(3);
  }

  {
    mockUsb.insertUsbDrive({});

    await request(app)
      .post('/central-scanner/scan/export-to-usb-drive')
      .set('Accept', 'application/json')
      .expect(200);

    const [usbDrive] = await mockUsb.mock.getUsbDrives();
    const cvrReportDirectoryPath = getCastVoteRecordReportPaths(usbDrive)[0];
    expect(cvrReportDirectoryPath).toContain('TEST__machine_000__3_ballots__');

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
    const cvrs = await castVoteRecordReportImportResult
      .assertOk('test')
      .CVR.map((unparsed) => unsafeParse(CVR.CVRSchema, unparsed))
      .toArray();
    expect(
      cvrs.map((cvr) =>
        convertCastVoteRecordVotesToLegacyVotes(cvr.CVRSnapshot[0])
      )
    ).toEqual([
      // sample-batch-1-ballot-1.png
      expect.objectContaining({ president: ['cramer-vuocolo'] }),
      // sample-batch-1-ballot-2.png
      expect.objectContaining({
        president: ['boone-lian'],
        'county-commissioners': ['argent', 'bainbridge', 'write-in-0'],
      }),
      // sample-batch-1-ballot-3.png
      expect.objectContaining({ president: ['barchi-hallaren'] }),
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
