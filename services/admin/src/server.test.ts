import { Logger, LogSource } from '@votingworks/logging';
import { assert } from '@votingworks/utils';
import { Application } from 'express';
import request from 'supertest';
import { dirSync } from 'tmp';
import { Server } from 'http';
import { buildApp, start } from './server';
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
  const fakeLogger = new Logger(LogSource.VxScanService);
  jest.spyOn(fakeLogger, 'log');

  // start up the server
  await start({ app, logger: fakeLogger, workspace });

  expect(fakeLogger.log).toHaveBeenCalled();
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

test('POST /admin/write-ins/adjudication', async () => {
  workspace.store.addAdjudication = jest.fn().mockImplementationOnce(() => '1');

  // Invalid request
  await request(app)
    .post('/admin/write-ins/adjudication')
    .set('Accept', 'application/json')
    .expect(400);
  expect(workspace.store.addAdjudication).not.toHaveBeenCalled();

  // Valid request
  await request(app)
    .post('/admin/write-ins/adjudication')
    .set('Accept', 'application/json')
    .send({ contestId: 'mayor' })
    .expect(200, { id: '1', status: 'ok' });
  expect(workspace.store.addAdjudication).toHaveBeenCalledWith('mayor');
});

test('PATCH /admin/write-ins/adjudication/transcribe', async () => {
  workspace.store.updateAdjudicationTranscribedValue = jest.fn();

  // Invalid request
  await request(app)
    .patch('/admin/write-ins/adjudication/transcribe')
    .set('Accept', 'application/json')
    .expect(400);
  expect(
    workspace.store.updateAdjudicationTranscribedValue
  ).not.toHaveBeenCalled();

  const adjudicationId = workspace.store.addAdjudication('mayor');
  const transcribedValue = 'Mickey Mouse';

  // Valid request
  await request(app)
    .patch('/admin/write-ins/adjudication/transcribe')
    .set('Accept', 'application/json')
    .send({ adjudicationId, transcribedValue })
    .expect(200);
  expect(
    workspace.store.updateAdjudicationTranscribedValue
  ).toHaveBeenCalledWith(adjudicationId, transcribedValue);
});
