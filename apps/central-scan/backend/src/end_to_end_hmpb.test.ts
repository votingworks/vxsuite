import {
  MockUsb,
  convertCastVoteRecordVotesToLegacyVotes,
  createMockUsb,
  getCastVoteRecordReportImport,
  validateCastVoteRecordReportDirectoryStructure,
} from '@votingworks/backend';
import { asElectionDefinition } from '@votingworks/fixtures';
import { CVR, unsafeParse } from '@votingworks/types';
import {
  BallotPackageManifest,
  CAST_VOTE_RECORD_REPORT_FILENAME,
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
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { fakeLogger, Logger } from '@votingworks/logging';
import * as stateOfHamilton from '../test/fixtures/state-of-hamilton';
import { makeMockScanner, MockScanner } from '../test/util/mocks';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { buildCentralScannerApp } from './central_scanner_app';
import { getCastVoteRecordReportPaths } from '../test/helpers/usb';

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

let auth: DippedSmartCardAuthApi;
let workspace: Workspace;
let scanner: MockScanner;
let mockUsb: MockUsb;
let importer: Importer;
let app: Application;
let logger: Logger;

beforeEach(async () => {
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

    const cvrs = await castVoteRecordReportImportResult
      .assertOk('test')
      .CVR.map((unparsed) => unsafeParse(CVR.CVRSchema, unparsed))
      .toArray();
    expect(cvrs).toHaveLength(1);
    const [cvr] = cvrs;
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
