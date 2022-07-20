import { fakeLogger } from '@votingworks/logging';
import { assert } from '@votingworks/utils';
import { Application } from 'express';
import request from 'supertest';
import { dirSync } from 'tmp';
import { Server } from 'http';
import { buildApp, start } from './server';
import { addTestCvr } from './test-util/store';
import { createWorkspace, Workspace } from './util/workspace';

let app: Application;
let workspace: Workspace;

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation();
  workspace = createWorkspace(dirSync().name);
  app = buildApp({ store: workspace.store });
});

test('starts with default logger and port', async () => {
  // don't actually listen
  jest.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });

  // start up the server
  await start({ app, workspace });

  expect(app.listen).toHaveBeenCalled();
});

/*
 ** TODO: this is here for coverage purposes, update to test that correct store
 ** config is loaded once we implement the DB.
 */
test('start with config options', async () => {
  // don't actually listen
  jest.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  const logger = fakeLogger();

  // start up the server
  await start({ app, logger, workspace });

  expect(logger.log).toHaveBeenCalled();
});

test('errors on start with no workspace', async () => {
  // start up the server
  try {
    await start({
      app,
      workspace: undefined,
    });
  } catch (err: any) {
    assert(err instanceof Error);
    expect(err.message).toMatch(
      'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE'
    );
  }
});

test('GET /admin/write-ins/adjudication/:id', async () => {
  // id param not in DB
  await request(app).get('/admin/write-ins/adjudication/1').expect(404);
  const cvrId = addTestCvr(workspace.store);

  // Valid request
  const id = workspace.store.addAdjudication('mayor', cvrId);
  await request(app).get(`/admin/write-ins/adjudication/${id}`).expect(200, {
    id,
    contestId: 'mayor',
    transcribedValue: '',
  });
});

test('PATCH /admin/write-ins/adjudications/:adjudicationId/transcription', async () => {
  workspace.store.updateAdjudicationTranscribedValue = jest.fn();
  const cvrId = addTestCvr(workspace.store);

  // Invalid request
  await request(app)
    .patch('/admin/write-ins/adjudications/1/transcription')
    .set('Accept', 'application/json')
    .expect(400);
  expect(
    workspace.store.updateAdjudicationTranscribedValue
  ).not.toHaveBeenCalled();

  const adjudicationId = workspace.store.addAdjudication('mayor', cvrId);
  const transcribedValue = 'Mickey Mouse';

  // Valid request
  await request(app)
    .patch(`/admin/write-ins/adjudications/${adjudicationId}/transcription`)
    .set('Accept', 'application/json')
    .send({ transcribedValue })
    .expect(200);
  expect(
    workspace.store.updateAdjudicationTranscribedValue
  ).toHaveBeenCalledWith(adjudicationId, transcribedValue);
});

test('GET /admin/write-ins/adjudications/:contestId/', async () => {
  await request(app)
    .get('/admin/write-ins/adjudications/mayor/')
    .expect(200, []);

  const cvrId = addTestCvr(workspace.store);
  const adjudicationId = workspace.store.addAdjudication(
    'mayor',
    cvrId,
    'Minnie Mouse'
  );
  const adjudicationId2 = workspace.store.addAdjudication(
    'mayor',
    cvrId,
    'Goofy'
  );
  workspace.store.addAdjudication('county-commissioner', cvrId, 'Daffy');

  // contestId that does not exist
  await request(app)
    .get('/admin/write-ins/adjudications/president/')
    .expect(200, []);

  // contestId that exists
  await request(app)
    .get('/admin/write-ins/adjudications/mayor/')
    .expect(200, [
      {
        contestId: 'mayor',
        cvrId,
        id: adjudicationId,
        transcribedValue: 'Minnie Mouse',
      },
      {
        contestId: 'mayor',
        cvrId,
        id: adjudicationId2,
        transcribedValue: 'Goofy',
      },
    ]);
});

test('GET /admin/write-ins/adjudications/contestId/count', async () => {
  await request(app)
    .get('/admin/write-ins/adjudications/contestId/count')
    .expect(200, []);

  const cvrId = addTestCvr(workspace.store);
  workspace.store.addAdjudication('mayor', cvrId, 'Minnie Mouse');
  workspace.store.addAdjudication('mayor', cvrId, 'Goofy');
  workspace.store.addAdjudication('county-commissioner', cvrId, 'Daffy');
  await request(app)
    .get('/admin/write-ins/adjudications/contestId/count')
    .expect(200, [
      { contestId: 'county-commissioner', adjudicationCount: 1 },
      { contestId: 'mayor', adjudicationCount: 2 },
    ]);
});

test('GET /admin/write-ins/reset', async () => {
  workspace.store.deleteCvrsAndCvrFiles = jest.fn();

  await request(app).get('/admin/write-ins/cvrs/reset').expect(200);
  expect(workspace.store.deleteCvrsAndCvrFiles).toHaveBeenCalled();
});

test('POST /admin/write-ins/cvrs', async () => {
  const cvrFileId = '2';
  workspace.store.addCvr = jest.fn().mockImplementationOnce(() => '1');
  workspace.store.addCvrFile = jest
    .fn()
    .mockImplementationOnce(() => cvrFileId);
  workspace.store.addAdjudication = jest.fn();

  const cvrs = [
    {
      _ballotId: 'id-29',
      _ballotType: 'absentee',
      _precinctId: 'precinct-3',
      _ballotStyleId: '1L',
      _testBallot: true,
      _scannerId: 'scanner-3',
      _batchId: '1234-4',
      _batchLabel: 'Batch 1',
      'governor-contest-liberty': ['aaron-aligator'],
      'mayor-contest-liberty': ['tahani-al-jamil'],
      'assistant-mayor-contest-liberty': ['jenna-morasca'],
    },
    {
      _ballotId: 'id-30',
      _ballotType: 'absentee',
      _precinctId: 'precinct-3',
      _ballotStyleId: '1L',
      _testBallot: true,
      _scannerId: 'scanner-3',
      _batchId: '1234-4',
      _batchLabel: 'Batch 1',
      'governor-contest-liberty': ['peter-pigeon'],
      'mayor-contest-liberty': ['write-in-jason-mendoza'],
      'assistant-mayor-contest-liberty': ['sandra-diaz-twine'],
    },
  ];

  // eslint-disable-next-line
  const reqParams = {
    signature: 'abc',
    name: 'test.jsonl',
    precinctIds: ['abc', '123'],
    scannerIds: ['1', '2'],
    timestamp: '12345678',
    castVoteRecords: [],
  };

  await request(app)
    .post('/admin/write-ins/cvrs')
    .set('Accept', 'application/json')
    .expect(400);
  expect(workspace.store.addCvr).not.toHaveBeenCalled();
  expect(workspace.store.addCvrFile).not.toHaveBeenCalled();

  // Valid request with no CVRs
  await request(app)
    .post('/admin/write-ins/cvrs')
    .set('Accept', 'application/json')
    .send(reqParams)
    .expect(200, {
      status: 'ok',
      importedCvrCount: 0,
      duplicateCvrCount: 0,
      isTestMode: false,
    });
  expect(workspace.store.addCvr).not.toHaveBeenCalled();
  expect(workspace.store.addCvrFile).toHaveBeenCalledTimes(1);

  // Valid request with CVRs
  await request(app)
    .post('/admin/write-ins/cvrs')
    .set('Accept', 'application/json')
    .send({ ...reqParams, castVoteRecords: cvrs })
    .expect(200, {
      status: 'ok',
      importedCvrCount: 2,
      duplicateCvrCount: 0,
      isTestMode: true,
    });
  expect(workspace.store.addAdjudication).toBeCalledTimes(1);
  expect(workspace.store.addCvr).toBeCalledTimes(2);
  expect(workspace.store.addCvrFile).toBeCalledTimes(2);
});

test('GET /admin/write-ins/transcribed-values', async () => {
  await request(app).get('/admin/write-ins/transcribed-values').expect(200, []);

  const cvrId = addTestCvr(workspace.store);

  workspace.store.addAdjudication('mayor', cvrId, 'Mickey Mouse');
  workspace.store.addAdjudication('county-commissioner', cvrId, 'Daffy');
  await request(app)
    .get('/admin/write-ins/transcribed-values')
    .expect(200, ['Daffy', 'Mickey Mouse']);
});
