import { Admin } from '@votingworks/api';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { assert, typedAs } from '@votingworks/utils';
import { Application } from 'express';
import { Server } from 'http';
import request from 'supertest';
import { dirSync } from 'tmp';
import { buildApp, start } from './server';
import { createWorkspace, Workspace } from './util/workspace';

let app: Application;
let workspace: Workspace;

beforeEach(() => {
  workspace = createWorkspace(dirSync().name);
  app = buildApp({ store: workspace.store });
});

test('starts with default logger and port', async () => {
  // don't actually listen
  jest.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  const logger = fakeLogger();

  // start up the server
  await start({ app, workspace, logger });

  expect(app.listen).toHaveBeenCalled();
});

test('start with config options', async () => {
  // don't actually listen
  jest.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  jest.spyOn(console, 'log').mockImplementation();

  // start up the server
  await start({ app, workspace });

  // eslint-disable-next-line no-console
  expect(console.log).toHaveBeenCalled();
});

test('errors on start with no workspace', async () => {
  // start up the server
  const logger = fakeLogger();
  try {
    await start({
      app,
      workspace: undefined,
      logger,
    });
  } catch (err: unknown) {
    assert(err instanceof Error);
    expect(err.message).toMatch(
      'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE'
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.AdminServiceConfigurationMessage,
      'system',
      {
        message: expect.stringContaining(
          'workspace path could not be determined'
        ),
        disposition: 'failure',
      }
    );
  }
});

test('GET /admin/elections', async () => {
  await request(app).get('/admin/elections').expect(200, []);

  const electionId = workspace.store.addElection(
    electionFamousNames2021Fixtures.electionDefinition.electionData
  );

  const response = await request(app).get('/admin/elections').expect(200);
  expect(response.body).toEqual([
    expect.objectContaining(
      typedAs<Partial<Admin.ElectionRecord>>({
        id: electionId,
        electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })
    ),
  ]);
});

test('POST /admin/elections', async () => {
  const response = await request(app)
    .post('/admin/elections')
    .set('Content-Type', 'application/json')
    .send(electionFamousNames2021Fixtures.electionDefinition)
    .expect(200);
  expect(response.body).toEqual({
    status: 'ok',
    id: expect.any(String),
  });

  const getResponse = await request(app).get('/admin/elections').expect(200);
  expect(getResponse.body).toEqual([
    expect.objectContaining(
      typedAs<Partial<Admin.ElectionRecord>>({
        id: response.body.id,
        electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
      })
    ),
  ]);

  await request(app)
    .post('/admin/elections')
    .set('Content-Type', 'application/json')
    .send('{}')
    .expect(400);

  await request(app)
    .post('/admin/elections')
    .set('Content-Type', 'application/json')
    .send({
      ...electionFamousNames2021Fixtures.electionDefinition,
      electionHash: 'd3adb33f',
    })
    .expect(400);
});

test('DELETE /admin/elections/:electionId', async () => {
  const electionId = workspace.store.addElection(
    electionFamousNames2021Fixtures.electionDefinition.electionData
  );

  await request(app).delete(`/admin/elections/${electionId}`).expect(200);
  await request(app).get('/admin/elections').expect(200, []);
});
