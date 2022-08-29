import { asElectionDefinition } from '@votingworks/fixtures';
import { AdjudicationReason, CastVoteRecord } from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { BallotPackageManifest, typedAs } from '@votingworks/utils';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import { Application } from 'express';
import * as fs from 'fs-extra';
import { join } from 'path';
import request from 'supertest';
import { dirSync } from 'tmp';
import * as choctawMockGeneral2020Fixtures from '../test/fixtures/choctaw-mock-general-election-2020';
import * as stateOfHamilton from '../test/fixtures/state-of-hamilton';
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { buildCentralScannerApp } from './central_scanner_app';

const electionFixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/state-of-hamilton'
);

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

let workspace: Workspace;
let scanner: MockScanner;
let importer: Importer;
let app: Application;

beforeEach(async () => {
  workspace = createWorkspace(dirSync().name);
  scanner = makeMockScanner();
  importer = new Importer({ workspace, scanner });
  app = await buildCentralScannerApp({ importer, store: workspace.store });
});

afterEach(async () => {
  await importer.unconfigure();
  await fs.remove(workspace.path);
});

test('going through the whole process works', async () => {
  jest.setTimeout(25000);

  // Do this first so interpreter workers get initialized with the right value.
  await request(app)
    .patch('/central-scanner/config/skipElectionHashCheck')
    .send({ skipElectionHashCheck: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  const { election } = stateOfHamilton;
  await importer.restoreConfig();

  await request(app)
    .patch('/central-scanner/config/election')
    .send(asElectionDefinition(election).electionData)
    .set('Content-Type', 'application/octet-stream')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  // need to turn off test mode after election is loaded
  await request(app)
    .patch('/central-scanner/config/testMode')
    .send({ testMode: false })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  const manifest: BallotPackageManifest = JSON.parse(
    await fs.readFile(join(electionFixturesRoot, 'manifest.json'), 'utf8')
  );

  const addTemplatesRequest = request(app).post(
    '/central-scanner/scan/hmpb/addTemplates'
  );

  for (const config of manifest.ballots) {
    void addTemplatesRequest
      .attach('ballots', join(electionFixturesRoot, config.filename))
      .attach(
        'metadatas',
        Buffer.from(new TextEncoder().encode(JSON.stringify(config))),
        { filename: 'config.json', contentType: 'application/json' }
      )
      .attach('layouts', join(electionFixturesRoot, config.layoutFilename));
  }

  await addTemplatesRequest.expect(200, { status: 'ok' });

  await request(app)
    .post('/central-scanner/scan/scanBatch')
    .expect(200)
    .then((response) => {
      expect(response.body).toEqual({
        status: 'error',
        errors: [{ type: 'scan-error', message: 'interpreter still loading' }],
      });
    });

  await request(app).post('/central-scanner/scan/hmpb/doneTemplates');

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
    expect(JSON.parse(status.text).batches.length).toBe(1);
    expect(JSON.parse(status.text).batches[0].count).toBe(1);
  }

  {
    const exportResponse = await request(app)
      .post('/central-scanner/scan/export')
      .set('Accept', 'application/json')
      .expect(200);

    const cvrs: CastVoteRecord[] = exportResponse.text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(cvrs).toHaveLength(1);
    const [cvr] = cvrs;
    expect(
      typedAs<CastVoteRecord>({ ...cvr, _ballotId: undefined, _batchId: '' })
    ).toMatchObject({
      _ballotStyleId: '12',
      _ballotType: 'standard',
      _locales: {
        primary: 'en-US',
        secondary: 'es-US',
      },
      _pageNumbers: [1, 2],
      _precinctId: '23',
      _scannerId: '000',
      _testBallot: false,
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

test('failed scan with QR code can be adjudicated and exported', async () => {
  jest.setTimeout(25000);

  // Do this first so interpreter workers get initialized with the right value.
  await request(app)
    .patch('/central-scanner/config/skipElectionHashCheck')
    .send({ skipElectionHashCheck: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  const { election } = stateOfHamilton;
  await importer.restoreConfig();

  await request(app)
    .patch('/central-scanner/config/election')
    .send(asElectionDefinition(election).electionData)
    .set('Content-Type', 'application/octet-stream')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  // need to turn off test mode after election is loaded
  await request(app)
    .patch('/central-scanner/config/testMode')
    .send({ testMode: false })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  const manifest: BallotPackageManifest = JSON.parse(
    await fs.readFile(join(electionFixturesRoot, 'manifest.json'), 'utf8')
  );

  const addTemplatesRequest = request(app).post(
    '/central-scanner/scan/hmpb/addTemplates'
  );

  for (const config of manifest.ballots) {
    void addTemplatesRequest
      .attach('ballots', join(electionFixturesRoot, config.filename))
      .attach(
        'metadatas',
        Buffer.from(new TextEncoder().encode(JSON.stringify(config))),
        { filename: 'config.json', contentType: 'application/json' }
      )
      .attach('layouts', join(electionFixturesRoot, config.layoutFilename));
  }

  await addTemplatesRequest.expect(200, { status: 'ok' });

  await request(app).post('/central-scanner/scan/hmpb/doneTemplates');

  {
    const nextSession = scanner.withNextScannerSession();

    nextSession
      .sheet([
        join(electionFixturesRoot, 'filled-in-dual-language-p3.jpg'),
        join(electionFixturesRoot, 'filled-in-dual-language-p4.jpg'),
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

    // check the latest batch has the expected ballots
    const status = await request(app)
      .get('/central-scanner/scan/status')
      .set('Accept', 'application/json')
      .expect(200);
    expect(JSON.parse(status.text).batches.length).toBe(1);
    expect(JSON.parse(status.text).batches[0].count).toBe(1);
  }

  await request(app)
    .post(`/central-scanner/scan/scanContinue`)
    .send(
      typedAs<Scan.ScanContinueRequest>({
        forceAccept: true,
        frontMarkAdjudications: [
          {
            type: AdjudicationReason.UninterpretableBallot,
            contestId: 'city-mayor',
            optionId: 'seldon',
            isMarked: true,
          },
        ],
        backMarkAdjudications: [
          {
            type: AdjudicationReason.UninterpretableBallot,
            contestId: 'question-a',
            optionId: 'no',
            isMarked: true,
          },
          {
            type: AdjudicationReason.UninterpretableBallot,
            contestId: 'question-b',
            optionId: 'yes',
            isMarked: true,
          },
        ],
      })
    )
    .expect(200);

  {
    const exportResponse = await request(app)
      .post('/central-scanner/scan/export')
      .set('Accept', 'application/json')
      .expect(200);

    // response is a few lines, each JSON.
    // can't predict the order so can't compare
    // to expected outcome as a string directly.
    const cvrs: CastVoteRecord[] = exportResponse.text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(cvrs).toHaveLength(1);
    const [cvr] = cvrs;
    expect(cvr).toMatchObject({
      _ballotId: expect.any(String),
      _ballotStyleId: '12',
      _ballotType: 'standard',
      _batchId: expect.any(String),
      _batchLabel: 'Batch 1',
      _locales: {
        primary: 'en-US',
        secondary: 'es-US',
      },
      _pageNumbers: [3, 4],
      _precinctId: '23',
      _scannerId: '000',
      _testBallot: false,
      'city-council': ['rupp', 'shry', 'davis', 'smith'],
      'city-mayor': ['seldon'],
      'county-commissioners': ['argent', 'altman', 'write-in-2'],
      'county-registrar-of-wills': [],
      'judicial-elmer-hull': ['yes'],
      'judicial-robert-demergue': ['yes', 'no'],
      'question-a': ['no'],
      'question-b': ['yes'],
      'question-c': ['no'],
    });
  }
});

test('ms-either-neither end-to-end', async () => {
  jest.setTimeout(25000);

  const { election, manifest, root, filledInPage1, filledInPage2 } =
    choctawMockGeneral2020Fixtures;
  await importer.restoreConfig();

  // Do this first so interpreter workers get initialized with the right value.
  await request(app)
    .patch('/central-scanner/config/skipElectionHashCheck')
    .send({ skipElectionHashCheck: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  await request(app)
    .patch('/central-scanner/config/election')
    .send(asElectionDefinition(election).electionData)
    .set('Content-Type', 'application/octet-stream')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  // need to turn off test mode after election is loaded
  await request(app)
    .patch('/central-scanner/config/testMode')
    .send({ testMode: false })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });

  const addTemplatesRequest = request(app).post(
    '/central-scanner/scan/hmpb/addTemplates'
  );

  for (const config of manifest.ballots) {
    void addTemplatesRequest
      .attach('ballots', join(root, config.filename), {
        filename: config.filename,
        contentType: 'application/pdf',
      })
      .attach(
        'metadatas',
        Buffer.from(new TextEncoder().encode(JSON.stringify(config))),
        { filename: 'ballot-config.json', contentType: 'application/json' }
      )
      .attach('layouts', join(root, config.layoutFilename));
  }

  await addTemplatesRequest.expect(200, { status: 'ok' });

  await request(app).post('/central-scanner/scan/hmpb/doneTemplates');

  {
    const nextSession = scanner.withNextScannerSession();

    nextSession.sheet([filledInPage1, filledInPage2]).end();

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

    // check the latest batch has the expected ballots
    const status = await request(app)
      .get('/central-scanner/scan/status')
      .set('Accept', 'application/json')
      .expect(200);
    expect(JSON.parse(status.text).batches.length).toBe(1);
    expect(JSON.parse(status.text).batches[0].count).toBe(1);
  }

  {
    const exportResponse = await request(app)
      .post('/central-scanner/scan/export')
      .set('Accept', 'application/json')
      .expect(200);

    // response is a few lines, each JSON.
    // can't predict the order so can't compare
    // to expected outcome as a string directly.
    const cvrs: CastVoteRecord[] = exportResponse.text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(cvrs).toHaveLength(1);
    const [cvr] = cvrs;
    expect(cvr).toMatchObject({
      '750000015': ['yes'],
      '750000016': ['yes'],
      '750000017': ['no'],
      '750000018': ['yes'],
      '775020870': ['write-in-0'],
      '775020872': ['775031978'],
      '775020876': ['775031988'],
      '775020877': ['775031986'],
      '775020899': ['775032015'],
      _ballotId: expect.any(String),
      _ballotStyleId: '4',
      _ballotType: 'standard',
      _batchId: expect.any(String),
      _batchLabel: 'Batch 1',
      _locales: {
        primary: 'en-US',
      },
      _pageNumbers: [1, 2],
      _precinctId: '6538',
      _scannerId: '000',
      _testBallot: false,
    });
  }
});
