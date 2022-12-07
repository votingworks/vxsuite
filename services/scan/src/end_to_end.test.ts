import { Scan } from '@votingworks/api';
import {
  asElectionDefinition,
  electionSample as election,
} from '@votingworks/fixtures';
import { CastVoteRecord } from '@votingworks/types';
import { Application } from 'express';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import request from 'supertest';
import { dirSync } from 'tmp';
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { buildCentralScannerApp } from './central_scanner_app';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';

const sampleBallotImagesPath = path.join(
  __dirname,
  '..',
  'sample-ballot-images/'
);

// we need more time for ballot interpretation
jest.setTimeout(20000);

let app: Application;
let importer: Importer;
let workspace: Workspace;
let scanner: MockScanner;

beforeEach(async () => {
  scanner = makeMockScanner();
  workspace = await createWorkspace(dirSync().name);
  importer = new Importer({
    workspace,
    scanner,
  });
  app = await buildCentralScannerApp({ importer, workspace });
});

afterEach(async () => {
  await fsExtra.remove(workspace.path);
});

test('going through the whole process works', async () => {
  const exportRequestBody: Scan.ExportRequest = {
    directoryPath: path.join(workspace.path, 'export/dir'),
    filename: 'cvrs_export.jsonl',
  };

  // try export before configure
  await request(app)
    .post('/central-scanner/scan/export')
    .set('Accept', 'application/json')
    .send(exportRequestBody)
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
        path.join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.png'),
        path.join(sampleBallotImagesPath, 'blank-page.png'),
      ])
      .sheet([
        path.join(sampleBallotImagesPath, 'sample-batch-1-ballot-2.png'),
        path.join(sampleBallotImagesPath, 'blank-page.png'),
      ])
      .sheet([
        path.join(sampleBallotImagesPath, 'sample-batch-1-ballot-3.png'),
        path.join(sampleBallotImagesPath, 'blank-page.png'),
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

    expect(JSON.parse(status.text).batches[0].count).toBe(3);
  }

  {
    await request(app)
      .post('/central-scanner/scan/export')
      .set('Accept', 'application/json')
      .send(exportRequestBody)
      .expect(200);

    const exportFileContents = fsExtra.readFileSync(
      path.join(workspace.path, 'export/dir/cvrs_export.jsonl'),
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
  await request(app)
    .post('/central-scanner/scan/export')
    .set('Accept', 'application/json')
    .send(exportRequestBody)
    .expect(200);

  const exportFileContents = fsExtra.readFileSync(
    path.join(workspace.path, 'export/dir/cvrs_export.jsonl'),
    'utf-8'
  );
  expect(exportFileContents).toEqual('');

  // clean up
  await request(app).delete('/central-scanner/config/election');
});
