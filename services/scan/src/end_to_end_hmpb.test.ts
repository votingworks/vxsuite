import { Exporter } from '@votingworks/data';
import { asElectionDefinition } from '@votingworks/fixtures';
import { CastVoteRecord } from '@votingworks/types';
import { typedAs } from '@votingworks/basics';
import {
  BallotPackageManifest,
  generateElectionBasedSubfolderName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import { Application } from 'express';
import * as fs from 'fs-extra';
import { join } from 'path';
import request from 'supertest';
import { dirSync } from 'tmp';
import { Scan } from '@votingworks/api';
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

const mockGetUsbDrives = jest.fn();
const exporter = new Exporter({
  allowedExportPatterns: ['/tmp/**'],
  getUsbDrives: mockGetUsbDrives,
});

let workspace: Workspace;
let scanner: MockScanner;
let importer: Importer;
let app: Application;

beforeEach(async () => {
  workspace = await createWorkspace(dirSync().name);
  scanner = makeMockScanner();
  importer = new Importer({ workspace, scanner });
  app = await buildCentralScannerApp({ exporter, importer, workspace });
});

afterEach(async () => {
  importer.unconfigure();
  await fs.remove(workspace.path);
});

test('going through the whole process works', async () => {
  jest.setTimeout(25000);

  const { election } = stateOfHamilton;
  await importer.restoreConfig();

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
    expect(JSON.parse(status.text).batches.length).toEqual(1);
    expect(JSON.parse(status.text).batches[0].count).toEqual(1);
  }

  {
    const mockUsbMountPoint = join(workspace.path, 'mock-usb');
    await fs.mkdir(mockUsbMountPoint, { recursive: true });
    mockGetUsbDrives.mockResolvedValue([
      { deviceName: 'mock-usb', mountPoint: mockUsbMountPoint },
    ]);

    const exportRequestBody: Scan.ExportToUsbDriveRequest = {
      filename: 'cvrs_export.jsonl',
    };
    await request(app)
      .post('/central-scanner/scan/export-to-usb-drive')
      .set('Accept', 'application/json')
      .send(exportRequestBody)
      .expect(200);

    const exportFileContents = fs.readFileSync(
      join(
        workspace.path,
        'mock-usb',
        SCANNER_RESULTS_FOLDER,
        generateElectionBasedSubfolderName(
          election,
          asElectionDefinition(election).electionHash
        ),
        'cvrs_export.jsonl'
      ),
      'utf-8'
    );
    const cvrs: CastVoteRecord[] = exportFileContents
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

test('ms-either-neither end-to-end', async () => {
  jest.setTimeout(25000);

  const { election, manifest, root, filledInPage1, filledInPage2 } =
    choctawMockGeneral2020Fixtures;
  await importer.restoreConfig();

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
    expect(JSON.parse(status.text).batches.length).toEqual(1);
    expect(JSON.parse(status.text).batches[0].count).toEqual(1);
  }

  {
    const mockUsbMountPoint = join(workspace.path, 'mock-usb');
    await fs.mkdir(mockUsbMountPoint, { recursive: true });
    mockGetUsbDrives.mockResolvedValue([
      { deviceName: 'mock-usb', mountPoint: mockUsbMountPoint },
    ]);

    const exportRequestBody: Scan.ExportToUsbDriveRequest = {
      filename: 'cvrs_export.jsonl',
    };
    await request(app)
      .post('/central-scanner/scan/export-to-usb-drive')
      .set('Accept', 'application/json')
      .send(exportRequestBody)
      .expect(200);

    const exportFileContents = fs.readFileSync(
      join(
        workspace.path,
        'mock-usb',
        SCANNER_RESULTS_FOLDER,
        generateElectionBasedSubfolderName(
          election,
          asElectionDefinition(election).electionHash
        ),
        'cvrs_export.jsonl'
      ),
      'utf-8'
    );
    const cvrs: CastVoteRecord[] = exportFileContents
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
