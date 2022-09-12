import { Admin } from '@votingworks/api';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { unsafeParse } from '@votingworks/types';
import { assert, typedAs } from '@votingworks/utils';
import { Buffer } from 'buffer';
import { Application } from 'express';
import { Server } from 'http';
import request from 'supertest';
import { dirSync } from 'tmp';
import { buildApp, start } from './server';
import { createWorkspace, Workspace } from './util/workspace';

let app: Application;
let workspace: Workspace;

beforeEach(() => {
  jest.restoreAllMocks();
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

test('POST /admin/elections/:electionId/cvr-files', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  const httpResponse = await request(app)
    .post(`/admin/elections/${electionId}/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .expect(200);
  const response = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    httpResponse.body
  );

  assert(response.status === 'ok');

  expect(
    workspace.store.getCastVoteRecordFileMetadata(response.id)
  ).toMatchObject(
    typedAs<Partial<Admin.CastVoteRecordFileMetadata>>({
      id: response.id,
      electionId,
      filename: 'cvrFile.json',
    })
  );

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(
    3000
  );
});

test('POST /admin/elections/:electionId/cvr-files duplicate file', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  const httpResponse = await request(app)
    .post(`/admin/elections/${electionId}/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .expect(200);
  const response = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    httpResponse.body
  );

  expect(response).toEqual(
    typedAs<Admin.PostCvrFileResponse>({
      status: 'ok',
      id: expect.any(String),
      wasExistingFile: false,
      newlyAdded: 3000,
      alreadyPresent: 0,
    })
  );

  const httpResponse2 = await request(app)
    .post(`/admin/elections/${electionId}/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .expect(200);
  const response2 = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    httpResponse2.body
  );

  expect(response2).toEqual(
    typedAs<Admin.PostCvrFileResponse>({
      status: 'ok',
      id: expect.any(String),
      wasExistingFile: true,
      newlyAdded: 0,
      alreadyPresent: 3000,
    })
  );
});

test('POST /admin/elections/:electionId/cvr-files?analyzeOnly=true', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  const httpResponse = await request(app)
    .post(`/admin/elections/${electionId}/cvr-files?analyzeOnly=true`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .expect(200);
  const response = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    httpResponse.body
  );

  expect(response).toEqual(
    typedAs<Admin.PostCvrFileResponse>({
      status: 'ok',
      id: expect.any(String),
      wasExistingFile: false,
      newlyAdded: 3000,
      alreadyPresent: 0,
    })
  );

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(0);
});

test('POST /admin/elections/:electionId/cvr-files without a file', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  await request(app)
    .post(`/admin/elections/${electionId}/cvr-files`)
    .expect(400);
});

test('POST /admin/elections/:electionId/cvr-files with duplicate CVR entries', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(0);

  const partial1HttpResponse = await request(app)
    .post(`/admin/elections/${electionId}/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.partial1CvrFile.asBuffer(),
      'cvrFile.json'
    )
    .expect(200);
  const partial1Response = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    partial1HttpResponse.body
  );

  expect(partial1Response).toEqual(
    typedAs<Admin.PostCvrFileResponse>({
      status: 'ok',
      id: expect.any(String),
      wasExistingFile: false,
      newlyAdded: 101,
      alreadyPresent: 0,
    })
  );

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(
    101
  );

  const partial2HttpResponse = await request(app)
    .post(`/admin/elections/${electionId}/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.partial2CvrFile.asBuffer(),
      'cvrFile.json'
    )
    .expect(200);

  const partial2Response = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    partial2HttpResponse.body
  );

  expect(partial2Response).toEqual(
    typedAs<Admin.PostCvrFileResponse>({
      status: 'ok',
      id: expect.any(String),
      wasExistingFile: false,
      newlyAdded: 20,
      alreadyPresent: 21,
    })
  );

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(
    121 /* 101 from partial1 + 20 new */
  );

  const standardHttpResponse = await request(app)
    .post(`/admin/elections/${electionId}/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .expect(200);

  const standardResponse = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    standardHttpResponse.body
  );

  expect(standardResponse).toEqual(
    typedAs<Admin.PostCvrFileResponse>({
      status: 'ok',
      id: expect.any(String),
      wasExistingFile: false,
      newlyAdded: 2879,
      alreadyPresent: 121,
    })
  );

  expect(partial2Response).toEqual(
    typedAs<Admin.PostCvrFileResponse>({
      status: 'ok',
      id: expect.any(String),
      wasExistingFile: false,
      newlyAdded: 20,
      alreadyPresent: 21,
    })
  );
  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(
    3000 /* 101 from partial1 + 20 from partial2 + 2879 new */
  );
});

test('POST /admin/elections/:electionId/cvr-files with duplicate ballot IDs', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(0);

  const cvrs = electionMinimalExhaustiveSampleFixtures.partial1CvrFile
    .asText()
    .split('\n');
  const cvr1 = JSON.parse(cvrs[0] as string);

  const httpResponse = await request(app)
    .post(`/admin/elections/${electionId}/cvr-files`)
    .attach(
      'cvrFile',
      Buffer.concat([
        Buffer.from(JSON.stringify(cvr1)),
        Buffer.from('\n'),
        Buffer.from(JSON.stringify({ ...cvr1, _something: 'different' })),
      ]),
      'cvrFile.json'
    )
    .expect(400);
  const response = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    httpResponse.body
  );

  expect(response).toEqual(
    typedAs<Admin.PostCvrFileResponse>({
      status: 'error',
      errors: [
        expect.objectContaining({
          type: 'BallotIdAlreadyExistsWithDifferentData',
        }),
      ],
    })
  );
});

test('DELETE /admin/elections/:electionId/cvr-files', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  await request(app)
    .post(`/admin/elections/${electionId}/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.partial1CvrFile.asBuffer(),
      'cvrFile.json'
    )
    .expect(200);

  await request(app)
    .delete(`/admin/elections/${electionId}/cvr-files`)
    .expect(200);

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(0);
});
