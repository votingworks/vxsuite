import {
  electionSampleDefinition as testElectionDefinition,
  electionFamousNames2021Fixtures,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotPageLayout,
  BallotPageLayoutWithImage,
  BallotType,
  InterpretedHmpbPage,
} from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { BallotConfig, typedAs } from '@votingworks/utils';
import { Buffer } from 'buffer';
import { Application } from 'express';
import * as fs from 'fs/promises';
import request from 'supertest';
import { dirSync } from 'tmp';
import { v4 as uuid } from 'uuid';
import * as stateOfHamilton from '../test/fixtures/state-of-hamilton';
import { makeMock } from '../test/util/mocks';
import { Importer } from './importer';
import { createWorkspace, Workspace } from './util/workspace';
import { buildCentralScannerApp } from './central_scanner_app';

jest.mock('./importer');
jest.mock('@votingworks/plustek-sdk');

let app: Application;
let workspace: Workspace;
let importer: jest.Mocked<Importer>;

beforeEach(async () => {
  importer = makeMock(Importer);
  workspace = await createWorkspace(dirSync().name);
  workspace.store.setElection(stateOfHamilton.electionDefinition);
  workspace.store.setTestMode(false);
  workspace.store.addHmpbTemplate(
    Buffer.of(),
    {
      locales: { primary: 'en-US' },
      electionHash: stateOfHamilton.electionDefinition.electionHash,
      ballotType: BallotType.Standard,
      ballotStyleId: '12',
      precinctId: '23',
      isTestMode: false,
    },
    [
      {
        pageSize: { width: 1, height: 1 },
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: stateOfHamilton.electionDefinition.electionHash,
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 1,
        },
        contests: [],
      },
      {
        pageSize: { width: 1, height: 1 },
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: stateOfHamilton.electionDefinition.electionHash,
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 2,
        },
        contests: [],
      },
    ]
  );
  app = await buildCentralScannerApp({ importer, store: workspace.store });
});

test('reloads configuration from the store', () => {
  // did we load everything from the store?
  expect(importer.restoreConfig).toHaveBeenCalled();
});

test('GET /scan/status', async () => {
  const status: Scan.GetScanStatusResponse = {
    canUnconfigure: false,
    batches: [],
    adjudication: { remaining: 0, adjudicated: 0 },
    scanner: Scan.ScannerStatus.Unknown,
  };
  importer.getStatus.mockResolvedValue(status);
  await request(app)
    .get('/central-scanner/scan/status')
    .set('Accept', 'application/json')
    .expect(200, status);
  expect(importer.getStatus).toBeCalled();
});

test('GET /config/election (application/octet-stream)', async () => {
  workspace.store.setElection(testElectionDefinition);
  workspace.store.setTestMode(true);
  workspace.store.setMarkThresholdOverrides(undefined);
  const response = await request(app)
    .get('/central-scanner/config/election')
    .accept('application/octet-stream')
    .expect(200);
  expect(new TextDecoder().decode(response.body)).toEqual(
    testElectionDefinition.electionData
  );

  workspace.store.setElection(undefined);
  await request(app)
    .get('/central-scanner/config/election')
    .accept('application/octet-stream')
    .expect(404);
});

test('GET /config/election (application/json)', async () => {
  workspace.store.setElection(testElectionDefinition);
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

  workspace.store.setElection(undefined);
  await request(app)
    .get('/central-scanner/config/election')
    .accept('application/json')
    .expect(200, 'null');
});

test('GET /config/testMode', async () => {
  workspace.store.setElection(testElectionDefinition);
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
  workspace.store.setElection(testElectionDefinition);
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

test('PATCH /config/election', async () => {
  await request(app)
    .patch('/central-scanner/config/election')
    .send(testElectionDefinition.electionData)
    .set('Content-Type', 'application/octet-stream')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });
  expect(importer.configure).toBeCalledWith(
    expect.objectContaining({
      election: expect.objectContaining({
        title: testElectionDefinition.election.title,
      }),
    })
  );

  // bad content type
  await request(app)
    .patch('/central-scanner/config/election')
    .send('gibberish')
    .set('Content-Type', 'text/plain')
    .set('Accept', 'application/json')
    .expect(400, {
      status: 'error',
      errors: [
        {
          type: 'invalid-value',
          message:
            'expected content type to be application/octet-stream, got text/plain',
        },
      ],
    });

  // bad JSON
  await request(app)
    .patch('/central-scanner/config/election')
    .send('gibberish')
    .set('Content-Type', 'application/octet-stream')
    .set('Accept', 'application/json')
    .expect(400, {
      status: 'error',
      errors: [
        {
          type: 'SyntaxError',
          message: 'Unexpected token g in JSON at position 0',
        },
      ],
    });
});

test('DELETE /config/election no-backup error', async () => {
  importer.unconfigure.mockResolvedValue();

  // Add a new batch that hasn't been backed up yet
  workspace.store.addBatch();

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
  importer.unconfigure.mockResolvedValue();
  workspace.store.setScannerAsBackedUp();

  await request(app)
    .delete('/central-scanner/config/election')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });
  expect(importer.unconfigure).toBeCalled();
});

test('DELETE /config/election ignores lack of backup when ?ignoreBackupRequirement=true is specified', async () => {
  importer.unconfigure.mockResolvedValue();

  // Add a new batch that hasn't been backed up yet
  workspace.store.addBatch();

  await request(app)
    .delete('/central-scanner/config/election?ignoreBackupRequirement=true')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });
  expect(importer.unconfigure).toBeCalled();
});

test('PUT /config/package', async () => {
  importer.configure.mockReturnValue();
  importer.addHmpbTemplates.mockResolvedValue([]);

  await request(app)
    .put('/central-scanner/config/package')
    .set('Accept', 'application/json')
    .attach(
      'package',
      electionFamousNames2021Fixtures.ballotPackageAsBuffer(),
      'ballot-package.zip'
    )
    .expect(200, { status: 'ok' });
  expect(importer.configure).toBeCalledWith(
    electionFamousNames2021Fixtures.electionDefinition
  );
  expect(importer.addHmpbTemplates).toHaveBeenCalledTimes(
    2 /* test & live */ *
      electionFamousNames2021Fixtures.election.ballotStyles.reduce(
        (acc, bs) => acc + bs.precincts.length,
        0
      )
  );
});

test('PUT /config/package missing package', async () => {
  await request(app)
    .put('/central-scanner/config/package')
    .set('Accept', 'application/json')
    .expect(400);
});

test('PATCH /config/testMode', async () => {
  importer.setTestMode.mockResolvedValueOnce(undefined);

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
  importer.setMarkThresholdOverrides.mockResolvedValue(undefined);

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

test('POST /scan/export', async () => {
  importer.doExport.mockReturnValue('');

  await request(app)
    .post('/central-scanner/scan/export')
    .set('Accept', 'application/json')
    .expect(200, '');
  expect(importer.doExport).toBeCalled();
});

test('POST /scan/zero error', async () => {
  importer.doZero.mockResolvedValue();

  // Add a new batch that hasn't been backed up yet
  workspace.store.addBatch();

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
  importer.doZero.mockResolvedValue();
  workspace.store.setScannerAsBackedUp();

  await request(app)
    .post('/central-scanner/scan/zero')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' });
  expect(importer.doZero).toBeCalled();
});

test('GET /scan/hmpb/ballot/:ballotId/:side/image', async () => {
  const frontOriginal = stateOfHamilton.filledInPage1Flipped;
  const frontNormalized = stateOfHamilton.filledInPage1;
  const backOriginal = stateOfHamilton.filledInPage2;
  const backNormalized = stateOfHamilton.filledInPage2;
  const batchId = workspace.store.addBatch();
  const sheetId = workspace.store.addSheet(uuid(), batchId, [
    {
      originalFilename: frontOriginal,
      normalizedFilename: frontNormalized,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: stateOfHamilton.electionDefinition.electionHash,
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
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
      },
    },
    {
      originalFilename: backOriginal,
      normalizedFilename: backNormalized,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: stateOfHamilton.electionDefinition.electionHash,
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
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
      },
    },
  ]);
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
    .get(`/central-scanner/scan/hmpb/ballot/${sheetId}/front/image/original`)
    .expect(200, await fs.readFile(frontOriginal));

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

  await request(app)
    .get(`/central-scanner/scan/hmpb/ballot/${sheetId}/back/image/original`)
    .expect(200, await fs.readFile(backOriginal));
});

test('GET /scan/hmpb/ballot/:sheetId/image 404', async () => {
  await request(app)
    .get(`/central-scanner/scan/hmpb/ballot/111/front/image/normalized`)
    .expect(404);
});

test('GET /', async () => {
  await request(app).get('/').expect(404);
});

test('POST /scan/hmpb/addTemplates bad template', async () => {
  const response = await request(app)
    .post('/central-scanner/scan/hmpb/addTemplates')
    .attach('ballots', Buffer.of(), {
      filename: 'README.txt',
      contentType: 'text/plain',
    })
    .expect(400);
  expect(JSON.parse(response.text)).toEqual({
    status: 'error',
    errors: [
      {
        type: 'invalid-ballot-type',
        message:
          'expected ballot files to be application/pdf, but got text/plain',
      },
    ],
  });
});

test('POST /scan/hmpb/addTemplates bad metadata', async () => {
  const response = await request(app)
    .post('/central-scanner/scan/hmpb/addTemplates')
    .attach('ballots', Buffer.of(), {
      filename: 'ballot.pdf',
      contentType: 'application/pdf',
    })
    .expect(400);
  expect(JSON.parse(response.text)).toEqual({
    status: 'error',
    errors: [
      {
        type: 'invalid-metadata-type',
        message:
          'expected ballot metadata to be application/json, but got undefined',
      },
    ],
  });
});

test('POST /scan/hmpb/addTemplates', async () => {
  const ballotConfig: BallotConfig = {
    ballotStyleId: '77',
    precinctId: '42',
    isLiveMode: true,
    isAbsentee: false,
    contestIds: [],
    locales: { primary: 'en-US' },
    filename: 'ballot.pdf',
    layoutFilename: 'layout.json',
  };
  const ballotPageLayoutWithImage: BallotPageLayoutWithImage = {
    imageData: {
      data: Uint8ClampedArray.of(0, 0, 0, 0),
      width: 1,
      height: 1,
    },
    ballotPageLayout: {
      pageSize: { width: 1, height: 1 },
      metadata: {
        locales: { primary: 'en-US' },
        electionHash: stateOfHamilton.electionDefinition.electionHash,
        ballotType: BallotType.Standard,
        ballotStyleId: '77',
        precinctId: '42',
        isTestMode: false,
        pageNumber: 1,
      },
      contests: [],
    },
  };
  importer.addHmpbTemplates.mockResolvedValueOnce([ballotPageLayoutWithImage]);

  const response = await request(app)
    .post('/central-scanner/scan/hmpb/addTemplates')
    .attach('ballots', Buffer.from('%PDF'), {
      filename: 'ballot.pdf',
      contentType: 'application/pdf',
    })
    .attach(
      'metadatas',
      Buffer.from(new TextEncoder().encode(JSON.stringify(ballotConfig))),
      { filename: 'metadata.json', contentType: 'application/json' }
    )
    .attach(
      'layouts',
      Buffer.from(
        new TextEncoder().encode(
          JSON.stringify([ballotPageLayoutWithImage.ballotPageLayout])
        )
      ),
      { filename: 'layout.json', contentType: 'application/json' }
    )
    .expect(200);

  expect(JSON.parse(response.text)).toEqual({ status: 'ok' });
  expect(importer.addHmpbTemplates).toHaveBeenCalledWith(Buffer.from('%PDF'), [
    ballotPageLayoutWithImage.ballotPageLayout,
  ]);
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
  const frontInterpretation: InterpretedHmpbPage = {
    type: 'InterpretedHmpbPage',
    metadata: {
      locales: { primary: 'en-US' },
      electionHash: stateOfHamilton.electionDefinition.electionHash,
      ballotType: BallotType.Standard,
      ballotStyleId: '12',
      precinctId: '23',
      isTestMode: false,
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

  const frontLayout: BallotPageLayout = {
    pageSize: { width: 1, height: 1 },
    metadata: frontInterpretation.metadata,
    contests: [],
  };
  const backLayout: BallotPageLayout = {
    pageSize: { width: 1, height: 1 },
    metadata: backInterpretation.metadata,
    contests: [],
  };
  jest
    .spyOn(workspace.store, 'getBallotLayoutsForMetadata')
    .mockReturnValue([frontLayout, backLayout]);

  await request(app)
    .get(`/central-scanner/scan/hmpb/review/next-sheet`)
    .expect(
      200,
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
          front: frontLayout,
          back: backLayout,
        },
        definitions: {
          front: { contestIds: [] },
          back: { contestIds: [] },
        },
      })
    );
});

test('calibrate success', async () => {
  importer.doCalibrate.mockResolvedValueOnce(true);

  await request(app).post('/central-scanner/scan/calibrate').expect(200, {
    status: 'ok',
  });
});

test('calibrate error', async () => {
  importer.doCalibrate.mockResolvedValueOnce(false);

  await request(app)
    .post('/central-scanner/scan/calibrate')
    .expect(200, {
      status: 'error',
      errors: [
        {
          type: 'calibration-error',
          message: 'scanner could not be calibrated',
        },
      ],
    });
});
