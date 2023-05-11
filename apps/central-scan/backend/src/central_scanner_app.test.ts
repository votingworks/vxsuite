import {
  MockUsb,
  createMockUsb,
  getCastVoteRecordReportImport,
} from '@votingworks/backend';
import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionSampleDefinition as testElectionDefinition,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotMetadata,
  BallotType,
  InterpretedHmpbPage,
  PageInterpretationWithFiles,
  SheetOf,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { CAST_VOTE_RECORD_REPORT_FILENAME } from '@votingworks/utils';
import { Application } from 'express';
import * as fs from 'fs/promises';
import request from 'supertest';
import { dirSync } from 'tmp';
import { v4 as uuid } from 'uuid';
import path from 'path';
import { typedAs } from '@votingworks/basics';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { Server } from 'http';
import { Logger, fakeLogger } from '@votingworks/logging';
import { makeMock } from '../test/util/mocks';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { buildCentralScannerApp } from './central_scanner_app';
import { getCastVoteRecordReportPaths } from '../test/helpers/usb';

jest.mock('./importer');

const jurisdiction = TEST_JURISDICTION;

let app: Application;
let auth: DippedSmartCardAuthApi;
let importer: jest.Mocked<Importer>;
let server: Server;
let workspace: Workspace;
let logger: Logger;
let mockUsb: MockUsb;

beforeEach(() => {
  auth = buildMockDippedSmartCardAuth();
  importer = makeMock(Importer);
  mockUsb = createMockUsb();
  logger = fakeLogger();
  workspace = createWorkspace(dirSync().name);
  workspace.store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireAmherstFixtures.electionDefinition
        .electionData,
    jurisdiction,
  });
  workspace.store.setTestMode(false);
  app = buildCentralScannerApp({
    auth,
    usb: mockUsb.mock,
    allowedExportPatterns: ['/tmp/**'],
    importer,
    workspace,
    logger,
  });
});

afterEach(async () => {
  await fs.rm(workspace.path, {
    force: true,
    recursive: true,
  });
  server?.close();
});

const frontNormalized =
  electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asFilePath();
const backNormalized =
  electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack.asFilePath();
const sheet: SheetOf<PageInterpretationWithFiles> = (() => {
  const metadata: BallotMetadata = {
    locales: { primary: 'en-US' },
    electionHash:
      electionGridLayoutNewHampshireAmherstFixtures.electionDefinition
        .electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId: '12',
    precinctId: '23',
    isTestMode: false,
  };
  return [
    {
      normalizedFilename: frontNormalized,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [],
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
        layout: {
          pageSize: { width: 0, height: 0 },
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          contests: [],
        },
      },
    },
    {
      normalizedFilename: backNormalized,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 2,
        },
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [],
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
        layout: {
          pageSize: { width: 0, height: 0 },
          metadata: {
            ...metadata,
            pageNumber: 2,
          },
          contests: [],
        },
      },
    },
  ];
})();

test('GET /config/election (application/octet-stream)', async () => {
  workspace.store.setElectionAndJurisdiction({
    electionData: testElectionDefinition.electionData,
    jurisdiction,
  });
  workspace.store.setTestMode(true);
  workspace.store.setMarkThresholdOverrides(undefined);
  const response = await request(app)
    .get('/central-scanner/config/election')
    .accept('application/octet-stream')
    .expect(200);
  expect(new TextDecoder().decode(response.body)).toEqual(
    testElectionDefinition.electionData
  );

  workspace.store.setElectionAndJurisdiction(undefined);
  await request(app)
    .get('/central-scanner/config/election')
    .accept('application/octet-stream')
    .expect(404);
});

test('GET /config/election (application/json)', async () => {
  workspace.store.setElectionAndJurisdiction({
    electionData: testElectionDefinition.electionData,
    jurisdiction,
  });
  workspace.store.setTestMode(true);
  workspace.store.setMarkThresholdOverrides(undefined);
  const response = await request(app)
    .get('/central-scanner/config/election')
    .accept('application/json')
    .expect(200);
  // This mess of a comparison is due to `Store#getElectionDefinition` adding
  // default `markThresholds` if they're not set, so it may not be the same as
  // we originally set.
  expect(response.body).toEqual(
    expect.objectContaining({
      electionHash: testElectionDefinition.electionHash,
      election: expect.objectContaining({
        title: testElectionDefinition.election.title,
      }),
    })
  );

  workspace.store.setElectionAndJurisdiction(undefined);
  await request(app)
    .get('/central-scanner/config/election')
    .accept('application/json')
    .expect(200, 'null');
});

test('GET /config/testMode', async () => {
  workspace.store.setElectionAndJurisdiction({
    electionData: testElectionDefinition.electionData,
    jurisdiction,
  });
  workspace.store.setTestMode(true);
  workspace.store.setMarkThresholdOverrides(undefined);
  const response = await request(app)
    .get('/central-scanner/config/testMode')
    .expect(200);
  expect(response.body).toEqual({
    status: 'ok',
    testMode: true,
  });
});

test('GET /config/markThresholdOverrides', async () => {
  workspace.store.setElectionAndJurisdiction({
    electionData: testElectionDefinition.electionData,
    jurisdiction,
  });
  workspace.store.setTestMode(true);
  workspace.store.setMarkThresholdOverrides({
    definite: 0.5,
    marginal: 0.4,
  });
  const response = await request(app)
    .get('/central-scanner/config/markThresholdOverrides')
    .expect(200);

  expect(response.body).toEqual({
    status: 'ok',
    markThresholdOverrides: { definite: 0.5, marginal: 0.4 },
  });
});

test('DELETE /config/election no-backup error', async () => {
  importer.unconfigure.mockReturnValue();

  // Add a new batch that hasn't been backed up yet
  const batchId = workspace.store.addBatch();
  workspace.store.addSheet(uuid(), batchId, sheet);
  workspace.store.finishBatch({ batchId });

  await request(app)
    .delete('/central-scanner/config/election')
    .set('Accept', 'application/json')
    .expect(400, {
      status: 'error',
      errors: [
        {
          type: 'no-backup',
          message: 'cannot unconfigure an election that has not been backed up',
        },
      ],
    });
  expect(importer.unconfigure).not.toBeCalled();
});

test('DELETE /config/election', async () => {
  importer.unconfigure.mockReturnValue();
  workspace.store.setScannerBackedUp();

  await request(app)
    .delete('/central-scanner/config/election')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });
  expect(importer.unconfigure).toBeCalled();
});

test('DELETE /config/election ignores lack of backup when ?ignoreBackupRequirement=true is specified', async () => {
  importer.unconfigure.mockReturnValue();

  // Add a new batch that hasn't been backed up yet
  const batchId = workspace.store.addBatch();
  workspace.store.addSheet(uuid(), batchId, sheet);
  workspace.store.finishBatch({ batchId });

  await request(app)
    .delete('/central-scanner/config/election?ignoreBackupRequirement=true')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });
  expect(importer.unconfigure).toBeCalled();
});

test('PATCH /config/testMode', async () => {
  importer.setTestMode.mockReturnValue(undefined);

  await request(app)
    .patch('/central-scanner/config/testMode')
    .send({ testMode: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200);

  expect(importer.setTestMode).toHaveBeenNthCalledWith(1, true);

  await request(app)
    .patch('/central-scanner/config/testMode')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .send({ testMode: false })
    .expect(200);

  expect(importer.setTestMode).toHaveBeenNthCalledWith(2, false);
});

test('PATCH /config/markThresholdOverrides', async () => {
  importer.setMarkThresholdOverrides.mockReturnValue(undefined);

  await request(app)
    .patch('/central-scanner/config/markThresholdOverrides')
    .send({ markThresholdOverrides: { marginal: 0.2, definite: 0.3 } })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200);

  expect(importer.setMarkThresholdOverrides).toHaveBeenNthCalledWith(1, {
    marginal: 0.2,
    definite: 0.3,
  });

  await request(app)
    .delete('/central-scanner/config/markThresholdOverrides')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200);

  expect(importer.setMarkThresholdOverrides).toHaveBeenNthCalledWith(
    2,
    undefined
  );
});

test('POST /scan/scanBatch', async () => {
  importer.startImport.mockResolvedValue('mock-batch-id');
  await request(app)
    .post('/central-scanner/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok', batchId: 'mock-batch-id' });
  expect(importer.startImport).toBeCalled();
});

test('POST /scan/scanContinue', async () => {
  importer.continueImport.mockResolvedValue(undefined);
  await request(app)
    .post('/central-scanner/scan/scanContinue')
    .send(typedAs<Scan.ScanContinueRequest>({ forceAccept: false }))
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });
  expect(importer.continueImport).toBeCalled();
});

test('POST /scan/scanBatch errors', async () => {
  importer.startImport.mockRejectedValue(new Error('scanner is a teapot'));
  await request(app)
    .post('/central-scanner/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, {
      status: 'error',
      errors: [{ type: 'scan-error', message: 'scanner is a teapot' }],
    });
  expect(importer.startImport).toBeCalled();
});

test('POST /scan/export-to-usb-drive', async () => {
  mockUsb.insertUsbDrive({});

  await request(app)
    .post('/central-scanner/scan/export-to-usb-drive')
    .set('Accept', 'application/json')
    .expect(200);

  const [usbDrive] = await mockUsb.mock.getUsbDrives();
  const cvrReportDirectoryPath = getCastVoteRecordReportPaths(usbDrive)[0];
  expect(cvrReportDirectoryPath).toContain('machine_000__0_ballots__');
  const castVoteRecordReportImportResult = await getCastVoteRecordReportImport(
    path.join(cvrReportDirectoryPath, CAST_VOTE_RECORD_REPORT_FILENAME)
  );
  expect(
    await castVoteRecordReportImportResult.assertOk('test').CVR.count()
  ).toEqual(0);
});

test('POST /scan/zero error', async () => {
  importer.doZero.mockReturnValue();

  // Add a new batch that hasn't been backed up yet
  const batchId = workspace.store.addBatch();
  workspace.store.addSheet(uuid(), batchId, sheet);
  workspace.store.finishBatch({ batchId });

  await request(app)
    .post('/central-scanner/scan/zero')
    .set('Accept', 'application/json')
    .expect(400, {
      status: 'error',
      errors: [
        {
          type: 'no-backup',
          message: 'cannot unconfigure an election that has not been backed up',
        },
      ],
    });
  expect(importer.doZero).not.toBeCalled();
});

test('POST /scan/zero', async () => {
  importer.doZero.mockReturnValue();
  workspace.store.setScannerBackedUp();

  await request(app)
    .post('/central-scanner/scan/zero')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });
  expect(importer.doZero).toBeCalled();
});

test('GET /scan/hmpb/ballot/:ballotId/:side/image', async () => {
  const batchId = workspace.store.addBatch();
  const sheetId = workspace.store.addSheet(uuid(), batchId, sheet);
  workspace.store.finishBatch({ batchId });

  await request(app)
    .get(`/central-scanner/scan/hmpb/ballot/${sheetId}/front/image`)
    .expect(301)
    .expect(
      'Location',
      `/central-scanner/scan/hmpb/ballot/${sheetId}/front/image/normalized`
    );

  await request(app)
    .get(`/central-scanner/scan/hmpb/ballot/${sheetId}/front/image/normalized`)
    .expect(200, await fs.readFile(frontNormalized));

  await request(app)
    .get(`/central-scanner/scan/hmpb/ballot/${sheetId}/back/image`)
    .expect(301)
    .expect(
      'Location',
      `/central-scanner/scan/hmpb/ballot/${sheetId}/back/image/normalized`
    );

  await request(app)
    .get(`/central-scanner/scan/hmpb/ballot/${sheetId}/back/image/normalized`)
    .expect(200, await fs.readFile(backNormalized));
});

test('GET /scan/hmpb/ballot/:sheetId/image 404', async () => {
  await request(app)
    .get(`/central-scanner/scan/hmpb/ballot/111/front/image/normalized`)
    .expect(404);
});

test('GET /', async () => {
  await request(app).get('/').expect(404);
});

test('get next sheet', async () => {
  jest.spyOn(workspace.store, 'getNextAdjudicationSheet').mockReturnValueOnce({
    id: 'mock-review-sheet',
    front: {
      image: { url: '/url/front' },
      interpretation: { type: 'BlankPage' },
    },
    back: {
      image: { url: '/url/back' },
      interpretation: { type: 'BlankPage' },
    },
  });

  await request(app)
    .get(`/central-scanner/scan/hmpb/review/next-sheet`)
    .expect(
      200,
      typedAs<Scan.GetNextReviewSheetResponse>({
        interpreted: {
          id: 'mock-review-sheet',
          front: {
            image: { url: '/url/front' },
            interpretation: { type: 'BlankPage' },
          },
          back: {
            image: { url: '/url/back' },
            interpretation: { type: 'BlankPage' },
          },
        },
        layouts: {},
        definitions: {},
      })
    );
});

test('get next sheet layouts', async () => {
  const metadata: BallotMetadata = {
    locales: { primary: 'en-US' },
    electionHash:
      electionGridLayoutNewHampshireAmherstFixtures.electionDefinition
        .electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId: 'card-number-3',
    precinctId: 'town-id-00701-precinct-id-',
    isTestMode: false,
  };
  const frontInterpretation: InterpretedHmpbPage = {
    type: 'InterpretedHmpbPage',
    metadata: {
      ...metadata,
      pageNumber: 1,
    },
    markInfo: {
      ballotSize: { width: 1, height: 1 },
      marks: [],
    },
    adjudicationInfo: {
      requiresAdjudication: true,
      enabledReasons: [AdjudicationReason.Overvote],
      enabledReasonInfos: [
        {
          type: AdjudicationReason.Overvote,
          contestId: 'contest-id',
          expected: 1,
          optionIds: ['option-id', 'option-id-2'],
          optionIndexes: [0, 1],
        },
      ],
      ignoredReasonInfos: [],
    },
    votes: {},
    layout: {
      pageSize: { width: 1, height: 1 },
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      contests: [],
    },
  };
  const backInterpretation: InterpretedHmpbPage = {
    ...frontInterpretation,
    metadata: {
      ...frontInterpretation.metadata,
      pageNumber: 2,
    },
  };
  jest.spyOn(workspace.store, 'getNextAdjudicationSheet').mockReturnValueOnce({
    id: 'mock-review-sheet',
    front: {
      image: { url: '/url/front' },
      interpretation: frontInterpretation,
    },
    back: {
      image: { url: '/url/back' },
      interpretation: backInterpretation,
    },
  });

  const response = await request(app)
    .get(`/central-scanner/scan/hmpb/review/next-sheet`)
    .expect(200);

  expect(response.body).toEqual(
    typedAs<Scan.GetNextReviewSheetResponse>({
      interpreted: {
        id: 'mock-review-sheet',
        front: {
          image: { url: '/url/front' },
          interpretation: frontInterpretation,
        },
        back: {
          image: { url: '/url/back' },
          interpretation: backInterpretation,
        },
      },
      layouts: {
        front: frontInterpretation.layout,
        back: backInterpretation.layout,
      },
      definitions: {
        front: { contestIds: expect.any(Array) },
        back: { contestIds: expect.any(Array) },
      },
    })
  );
});
