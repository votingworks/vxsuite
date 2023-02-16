import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { Exporter } from '@votingworks/backend';
import {
  asElectionDefinition,
  electionSample as election,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { CastVoteRecord } from '@votingworks/types';
import {
  generateElectionBasedSubfolderName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import { Application } from 'express';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import request from 'supertest';
import { dirSync } from 'tmp';
import {
  advanceTo as setDateMock,
  clear as clearDateMock,
} from 'jest-date-mock';
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { buildCentralScannerApp } from './central_scanner_app';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';

// we need more time for ballot interpretation
jest.setTimeout(20000);

const mockGetUsbDrives = jest.fn();
const exporter = new Exporter({
  allowedExportPatterns: ['/tmp/**'],
  getUsbDrives: mockGetUsbDrives,
});

let app: Application;
let auth: DippedSmartCardAuthApi;
let importer: Importer;
let workspace: Workspace;
let scanner: MockScanner;

beforeEach(async () => {
  auth = buildMockDippedSmartCardAuth();
  scanner = makeMockScanner();
  workspace = await createWorkspace(dirSync().name);
  importer = new Importer({
    workspace,
    scanner,
  });
  app = await buildCentralScannerApp({ auth, exporter, importer, workspace });
});

afterEach(async () => {
  await fsExtra.remove(workspace.path);
});

test('going through the whole process works', async () => {
  setDateMock(new Date(2018, 5, 27, 0, 0, 0));

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
    const mockUsbMountPoint = path.join(workspace.path, 'mock-usb');
    await fsExtra.mkdir(mockUsbMountPoint, { recursive: true });
    mockGetUsbDrives.mockResolvedValue([
      { deviceName: 'mock-usb', mountPoint: mockUsbMountPoint },
    ]);

    await request(app)
      .post('/central-scanner/scan/export-to-usb-drive')
      .set('Accept', 'application/json')
      .expect(200);

    const exportFileContents = fsExtra.readFileSync(
      path.join(
        workspace.path,
        'mock-usb',
        SCANNER_RESULTS_FOLDER,
        generateElectionBasedSubfolderName(
          election,
          asElectionDefinition(election).electionHash
        ),
        'TEST__machine_000__3_ballots__2018-06-27_00-00-00.jsonl'
      ),
      'utf-8'
    );
    const cvrs: CastVoteRecord[] = exportFileContents
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(cvrs).toEqual([
      // sample-batch-1-ballot-1.png
      expect.objectContaining({ president: ['cramer-vuocolo'] }),
      // sample-batch-1-ballot-2.png
      expect.objectContaining({
        president: ['boone-lian'],
        'county-commissioners': ['argent', 'bainbridge', 'write-in-BOB SMITH'],
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
        .delete(`/central-scanner/scan/batch/${id}`)
        .set('Accept', 'application/json')
        .expect(200);

      // can't delete it again
      await request(app)
        .delete(`/central-scanner/scan/batch/${id}`)
        .set('Accept', 'application/json')
        .expect(404);
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

  // no CVRs!
  setDateMock(new Date(2018, 5, 28, 0, 0, 0));
  const mockUsbMountPoint = path.join(workspace.path, 'mock-usb');
  await fsExtra.mkdir(mockUsbMountPoint, { recursive: true });
  mockGetUsbDrives.mockResolvedValue([
    { deviceName: 'mock-usb', mountPoint: mockUsbMountPoint },
  ]);
  await request(app)
    .post('/central-scanner/scan/export-to-usb-drive')
    .set('Accept', 'application/json')
    .expect(200);

  expect(
    fsExtra
      .readFileSync(
        path.join(
          workspace.path,
          'mock-usb',
          SCANNER_RESULTS_FOLDER,
          generateElectionBasedSubfolderName(
            election,
            asElectionDefinition(election).electionHash
          ),
          'TEST__machine_000__0_ballots__2018-06-28_00-00-00.jsonl'
        )
      )
      .toString()
  ).toEqual('');

  // clean up
  await request(app).delete('/central-scanner/config/election');
  clearDateMock();
});
