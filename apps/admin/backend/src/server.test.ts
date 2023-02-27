import { Admin } from '@votingworks/api';
import { assert, assertDefined, typedAs } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { BallotId, CastVoteRecord, unsafeParse } from '@votingworks/types';
import { Buffer } from 'buffer';
import { Application } from 'express';
import { promises as fs } from 'fs';
import { Server } from 'http';
import request from 'supertest';
import { dirSync, fileSync } from 'tmp';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { Api, buildApp, start } from './server';
import { createWorkspace, Workspace } from './util/workspace';
import { PORT } from './globals';
import { setElection } from '../test/server';

let app: Application;
let auth: DippedSmartCardAuthApi;
let server: Server;
let workspace: Workspace;

beforeEach(() => {
  jest.restoreAllMocks();
  auth = buildMockDippedSmartCardAuth();
  workspace = createWorkspace(dirSync().name);
  app = buildApp({ auth, workspace });
});

afterEach(() => {
  server?.close();
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
      })
    ),
  ]);
});

test('POST /admin/elections', async () => {
  expect(workspace.store.getCurrentElectionId()).toBeUndefined();
  const response = await request(app)
    .post('/admin/elections')
    .set('Content-Type', 'application/json')
    .send(electionFamousNames2021Fixtures.electionDefinition)
    .expect(200);
  expect(response.body).toEqual({
    status: 'ok',
  });
  expect(workspace.store.getCurrentElectionId()).toBeDefined();

  const getResponse = await request(app).get('/admin/elections').expect(200);
  expect(getResponse.body).toEqual([
    expect.objectContaining(
      typedAs<Admin.ElectionRecord>({
        electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
        id: expect.anything(),
        isOfficialResults: false,
        createdAt: expect.anything(),
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

test('DELETE /admin/elections', async () => {
  await request(app)
    .post('/admin/elections')
    .set('Content-Type', 'application/json')
    .send(electionFamousNames2021Fixtures.electionDefinition)
    .expect(200);
  const nonEmptyResponse = await request(app)
    .get('/admin/elections')
    .expect(200);
  expect(nonEmptyResponse.body).toHaveLength(1);
  await request(app).delete(`/admin/elections`).expect(200);
  const emptyResponse = await request(app).get('/admin/elections').expect(200);
  expect(emptyResponse.body).toHaveLength(0);
  expect(workspace.store.getCurrentElectionId()).toBeUndefined();
});

test('GET /admin/elections/cvr-files happy path', async () => {
  const cvrFiles: Admin.CastVoteRecordFileRecord[] = [
    {
      id: 'cvr-file-2',
      createdAt: new Date().toISOString(),
      electionId: 'test-election-2',
      exportTimestamp: '2021-10-24T00:30:14.513Z',
      filename: 'cvrs-2.jsonl',
      numCvrsImported: 41,
      precinctIds: ['precinct-1', 'precinct-2'],
      scannerIds: ['scanner-1', 'scanner-2'],
      sha256Hash: 'file-2-hash',
    },
    {
      id: 'cvr-file-1',
      createdAt: new Date().toISOString(),
      electionId: 'test-election-2',
      exportTimestamp: '2021-09-02T22:27:58.327Z',
      filename: 'cvrs-1.jsonl',
      numCvrsImported: 101,
      precinctIds: ['precinct-2'],
      scannerIds: ['scanner-1'],
      sha256Hash: 'file-1-hash',
    },
  ];

  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  jest
    .spyOn(workspace.store, 'getCvrFiles')
    .mockImplementationOnce(() => cvrFiles);

  const response = await request(app)
    .get(`/admin/elections/cvr-files`)
    .expect(200);

  const parsedResponse = unsafeParse(
    Admin.GetCvrFilesResponseSchema,
    response.body
  );

  expect(parsedResponse).toEqual<Admin.GetCvrFilesResponse>(cvrFiles);
});

test('GET /admin/elections/cvr-files empty response', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  jest.spyOn(workspace.store, 'getCvrFiles').mockImplementationOnce(() => []);

  const response = await request(app)
    .get(`/admin/elections/cvr-files`)
    .expect(200);

  const parsedResponse = unsafeParse(
    Admin.GetCvrFilesResponseSchema,
    response.body
  );

  expect(parsedResponse).toEqual<Admin.GetCvrFilesResponse>([]);
});

test('GET /admin/elections/cvrs happy path', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  const emptyResponse = await request(app)
    .get(`/admin/elections/cvrs`)
    .expect(200);
  expect(emptyResponse.body).toEqual([]);

  const cvr1: CastVoteRecord = {
    _ballotId: 'id-9999999' as BallotId,
    _ballotStyleId: '1M',
    _ballotType: 'absentee',
    _batchId: 'batch-id',
    _batchLabel: 'batch-label',
    _precinctId: 'precinct-1',
    _scannerId: 'scanner-1',
    _testBallot: false,
  };
  const cvr2: CastVoteRecord = {
    ...cvr1,
    _ballotId: 'id-9999991' as BallotId,
    _precinctId: 'precinct-2',
    _scannerId: 'scanner-1',
  };
  const cvr3: CastVoteRecord = {
    ...cvr1,
    _ballotId: 'id-9999992' as BallotId,
    _precinctId: 'precinct-1',
    _scannerId: 'scanner-2',
  };

  const fileWithCvrs1And2 = fileSync();
  await fs.writeFile(
    fileWithCvrs1And2.name,
    [cvr1, cvr2].map((c) => JSON.stringify(c)).join('\n')
  );

  const fileWithCvrs2And3 = fileSync();
  await fs.writeFile(
    fileWithCvrs2And3.name,
    [cvr2, cvr3].map((c) => JSON.stringify(c)).join('\n')
  );

  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  await workspace.store.addCastVoteRecordFile({
    electionId,
    filePath: fileWithCvrs1And2.name,
    originalFilename: 'fileWithCvrs1And2.jsonl',
    exportedTimestamp: '2021-09-02T22:27:58.327Z',
  });

  await workspace.store.addCastVoteRecordFile({
    electionId,
    filePath: fileWithCvrs2And3.name,
    originalFilename: 'fileWithCvrs2And3.jsonl',
    exportedTimestamp: '2021-10-24T00:30:14.513Z',
  });

  const nonEmptyResponse = await request(app)
    .get(`/admin/elections/cvrs`)
    .expect(200);
  expect(nonEmptyResponse.body).toEqual<Admin.GetCvrsResponse>([
    cvr1,
    cvr2,
    cvr3,
  ]);
});

test('GET /admin/elections/cvrs error response', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  jest
    .spyOn(workspace.store, 'getCastVoteRecordEntries')
    .mockImplementationOnce(() => {
      throw new Error('something went wrong');
    });

  await request(app).get('/admin/elections/cvrs').expect(500);
});

test('POST /admin/elections/cvr-files', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  const httpResponse = await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
    .expect(200);
  const response = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    httpResponse.body
  );

  assert(response.status === 'ok');

  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  expect(workspace.store.getCvrFiles(electionId)).toEqual([
    expect.objectContaining<Partial<Admin.CastVoteRecordFileRecord>>({
      id: response.id,
      electionId,
      filename: 'cvrFile.json',
    }),
  ]);

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(
    3000
  );
});

test('POST /admin/elections/cvr-files duplicate file', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  const httpResponse = await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
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
      exportedTimestamp: '2021-09-02T22:27:58.327Z',
      fileMode: Admin.CvrFileMode.Test,
      fileName: 'cvrFile.json',
      scannerIds: expect.arrayContaining(['scanner-1', 'scanner-2']),
    })
  );

  const httpResponse2 = await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
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
      exportedTimestamp: '2021-09-02T22:27:58.327Z',
      fileMode: Admin.CvrFileMode.Test,
      fileName: 'cvrFile.json',
      scannerIds: [],
    })
  );
});

test('POST /admin/elections/cvr-files?analyzeOnly=true', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  const httpResponse = await request(app)
    .post(`/admin/elections/cvr-files?analyzeOnly=true`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
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
      exportedTimestamp: '2021-09-02T22:27:58.327Z',
      fileMode: Admin.CvrFileMode.Test,
      fileName: 'cvrFile.json',
      scannerIds: expect.arrayContaining(['scanner-1', 'scanner-2']),
    })
  );

  const electionId = assertDefined(workspace.store.getCurrentElectionId());
  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(0);
});

test('POST /admin/elections/cvr-files bad query param', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  await request(app)
    .post(`/admin/elections/cvr-files?bad=query`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
    .expect(400);
});

test('POST /admin/elections/cvr-files without a file', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  await request(app)
    .post(`/admin/elections/cvr-files`)
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
    .expect(400);
});

test('POST /admin/elections/cvr-files without exportedTimestamp', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .expect(400);
});

test('POST /admin/elections/cvr-files with duplicate CVR entries', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(0);

  const partial1HttpResponse = await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.partial1CvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
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
      exportedTimestamp: '2021-09-02T22:27:58.327Z',
      fileMode: Admin.CvrFileMode.Test,
      fileName: 'cvrFile.json',
      scannerIds: expect.arrayContaining(['scanner-1', 'scanner-2']),
    })
  );

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(
    101
  );

  const partial2HttpResponse = await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.partial2CvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
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
      exportedTimestamp: '2021-09-02T22:27:58.327Z',
      fileMode: Admin.CvrFileMode.Test,
      fileName: 'cvrFile.json',
      scannerIds: expect.arrayContaining(['scanner-1', 'scanner-2']),
    })
  );

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(
    121 /* 101 from partial1 + 20 new */
  );

  const standardHttpResponse = await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
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
      exportedTimestamp: '2021-09-02T22:27:58.327Z',
      fileMode: Admin.CvrFileMode.Test,
      fileName: 'cvrFile.json',
      scannerIds: expect.arrayContaining(['scanner-1', 'scanner-2']),
    })
  );

  expect(partial2Response).toEqual(
    typedAs<Admin.PostCvrFileResponse>({
      status: 'ok',
      id: expect.any(String),
      wasExistingFile: false,
      newlyAdded: 20,
      alreadyPresent: 21,
      exportedTimestamp: '2021-09-02T22:27:58.327Z',
      fileMode: Admin.CvrFileMode.Test,
      fileName: 'cvrFile.json',
      scannerIds: expect.arrayContaining(['scanner-1', 'scanner-2']),
    })
  );
  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(
    3000 /* 101 from partial1 + 20 from partial2 + 2879 new */
  );
});

test('POST /admin/elections/cvr-files with duplicate ballot IDs', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(0);

  const cvrs = electionMinimalExhaustiveSampleFixtures.partial1CvrFile
    .asText()
    .split('\n');
  const cvr1 = JSON.parse(cvrs[0] as string);

  const httpResponse = await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      Buffer.concat([
        Buffer.from(JSON.stringify(cvr1)),
        Buffer.from('\n'),
        Buffer.from(JSON.stringify({ ...cvr1, _something: 'different' })),
      ]),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
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

test('DELETE /admin/elections/cvr-files', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.partial1CvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
    .expect(200);

  await request(app).delete(`/admin/elections/cvr-files`).expect(200);

  expect(workspace.store.getCastVoteRecordEntries(electionId)).toHaveLength(0);
});

test('GET /admin/elections/write-ins', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  const postCvrHttpResponse = await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
    .expect(200);
  const postCvrResponse = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    postCvrHttpResponse.body
  );

  assert(postCvrResponse.status === 'ok');

  const getWriteInsHttpResponse = await request(app)
    .get(`/admin/elections/write-ins`)
    .expect(200);
  const getWriteInsResponse = unsafeParse(
    Admin.GetWriteInsResponseSchema,
    getWriteInsHttpResponse.body
  );

  expect(getWriteInsResponse).toHaveLength(
    workspace.store.getWriteInRecords({ electionId }).length
  );

  const getWriteInsHttpResponse2 = await request(app)
    .get(`/admin/elections/write-ins?contestId=zoo-council-mammal`)
    .expect(200);
  const getWriteInsResponse2 = unsafeParse(
    Admin.GetWriteInsResponseSchema,
    getWriteInsHttpResponse2.body
  );

  expect(getWriteInsResponse2).toHaveLength(
    workspace.store.getWriteInRecords({
      electionId,
      contestId: 'zoo-council-mammal',
    }).length
  );

  const getWriteInsHttpResponse3 = await request(app)
    .get(`/admin/elections/write-ins?limit=3`)
    .expect(200);
  const getWriteInsResponse3 = unsafeParse(
    Admin.GetWriteInsResponseSchema,
    getWriteInsHttpResponse3.body
  );

  expect(getWriteInsResponse3).toHaveLength(3);
});

test('GET /admin/elections/write-ins invalid query', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  await request(app).get(`/admin/elections/write-ins?bad=query`).expect(400);
});

test('PUT /admin/write-ins/:writeInId/transcription', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  const postCvrHttpResponse = await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
    .expect(200);
  const postCvrResponse = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    postCvrHttpResponse.body
  );

  assert(postCvrResponse.status === 'ok');

  const [writeInRecord] = workspace.store.getWriteInRecords({
    electionId,
    limit: 1,
  });
  assert(writeInRecord);

  const getWriteInsHttpResponse = await request(app)
    .get(`/admin/elections/write-ins`)
    .expect(200);
  const getWriteInsResponse = unsafeParse(
    Admin.GetWriteInsResponseSchema,
    getWriteInsHttpResponse.body
  );
  assert(Array.isArray(getWriteInsResponse));
  expect(new Set(getWriteInsResponse.map(({ status }) => status))).toEqual(
    new Set(['pending'])
  );

  await request(app)
    .put(`/admin/write-ins/${writeInRecord.id}/transcription`)
    .send(
      typedAs<Admin.PutWriteInTranscriptionRequest>({
        value: 'Mickey Mouse',
      })
    )
    .expect(200);

  const getWriteInsHttpResponse2 = await request(app)
    .get(`/admin/elections/write-ins?status=transcribed`)
    .expect(200);
  const getWriteInsResponse2 = unsafeParse(
    Admin.GetWriteInsResponseSchema,
    getWriteInsHttpResponse2.body
  );
  assert(Array.isArray(getWriteInsResponse2));
  expect(new Set(getWriteInsResponse2.map(({ status }) => status))).toEqual(
    new Set(['transcribed'])
  );
});

test('PUT /admin/write-ins/:writeInId/transcription missing value', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  const postCvrHttpResponse = await request(app)
    .post(`/admin/elections/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .field('exportedTimestamp', '2021-09-02T22:27:58.327Z')
    .expect(200);
  const postCvrResponse = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    postCvrHttpResponse.body
  );

  assert(postCvrResponse.status === 'ok');

  const [writeInRecord] = workspace.store.getWriteInRecords({
    electionId,
    limit: 1,
  });
  assert(writeInRecord);

  await request(app)
    .put(`/admin/write-ins/${writeInRecord.id}/transcription`)
    .send({})
    .expect(400);
});

test('GET /admin/elections/write-in-adjudications', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);
  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  const getWriteInAdjudicationsInitialHttpResponse = await request(app)
    .get(`/admin/elections/write-in-adjudications`)
    .expect(200);

  const getWriteInAdjudicationsInitialResponse = unsafeParse(
    Admin.GetWriteInAdjudicationsResponseSchema,
    getWriteInAdjudicationsInitialHttpResponse.body
  );

  expect(getWriteInAdjudicationsInitialResponse).toEqual(
    typedAs<Admin.GetWriteInAdjudicationsResponse>([])
  );

  workspace.store.createWriteInAdjudication({
    electionId,
    contestId: 'zoo-council-mammal',
    transcribedValue: 'Bob',
    adjudicatedValue: 'Robert',
  });

  const getWriteInAdjudicationsHttpResponse = await request(app)
    .get(`/admin/elections/write-in-adjudications`)
    .expect(200);

  const getWriteInAdjudicationsResponse = unsafeParse(
    Admin.GetWriteInAdjudicationsResponseSchema,
    getWriteInAdjudicationsHttpResponse.body
  );

  expect(getWriteInAdjudicationsResponse).toEqual(
    typedAs<Admin.GetWriteInAdjudicationsResponse>([
      {
        id: expect.any(String),
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Bob',
        adjudicatedValue: 'Robert',
      },
      {
        id: expect.any(String),
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Robert',
        adjudicatedValue: 'Robert',
      },
    ])
  );

  const getWriteInAdjudicationsFilterMismatchHttpResponse = await request(app)
    .get(`/admin/elections/write-in-adjudications?contestId=zoo-council-fish`)
    .expect(200);

  const getWriteInAdjudicationsFilterMismatchResponse = unsafeParse(
    Admin.GetWriteInAdjudicationsResponseSchema,
    getWriteInAdjudicationsFilterMismatchHttpResponse.body
  );

  expect(getWriteInAdjudicationsFilterMismatchResponse).toEqual(
    typedAs<Admin.GetWriteInAdjudicationsResponse>([])
  );

  const getWriteInAdjudicationsFilterMatchHttpResponse = await request(app)
    .get(`/admin/elections/write-in-adjudications?contestId=zoo-council-mammal`)
    .expect(200);

  const getWriteInAdjudicationsFilterMatchResponse = unsafeParse(
    Admin.GetWriteInAdjudicationsResponseSchema,
    getWriteInAdjudicationsFilterMatchHttpResponse.body
  );

  expect(getWriteInAdjudicationsFilterMatchResponse).toEqual(
    typedAs<Admin.GetWriteInAdjudicationsResponse>([
      {
        id: expect.any(String),
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Bob',
        adjudicatedValue: 'Robert',
      },
      {
        id: expect.any(String),
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Robert',
        adjudicatedValue: 'Robert',
      },
    ])
  );
});

test('GET /admin/elections/write-in-adjudications bad query', async () => {
  await setElection(app, electionMinimalExhaustiveSampleDefinition);

  await request(app)
    .get(`/admin/elections/write-in-adjudications?bad=query`)
    .expect(400);
});

test('auth', async () => {
  const logger = fakeLogger();
  workspace.store.addElection(
    electionMinimalExhaustiveSampleDefinition.electionData
  );
  workspace.store.addElection(
    electionFamousNames2021Fixtures.electionDefinition.electionData
  );
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { electionData, electionHash } = electionDefinition;
  server = await start({ app, logger, workspace });
  const apiClient = grout.createClient<Api>({
    baseUrl: `http://localhost:${PORT}/api`,
  });

  await apiClient.getAuthStatus();
  await apiClient.checkPin({ pin: '123456' });
  await apiClient.logOut();
  void (await apiClient.programCard({ userRole: 'system_administrator' }));
  void (await apiClient.programCard({ userRole: 'election_manager' }));
  void (await apiClient.unprogramCard());

  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, { electionHash });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { pin: '123456' }
  );
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, { electionHash });
  expect(auth.programCard).toHaveBeenCalledTimes(2);
  expect(auth.programCard).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { userRole: 'system_administrator' }
  );
  expect(auth.programCard).toHaveBeenNthCalledWith(
    2,
    { electionHash },
    { userRole: 'election_manager', electionData }
  );
  expect(auth.unprogramCard).toHaveBeenCalledTimes(1);
  expect(auth.unprogramCard).toHaveBeenNthCalledWith(1, { electionHash });
});

test('auth before election definition has been configured', async () => {
  const logger = fakeLogger();
  server = await start({ app, logger, workspace });
  const apiClient = grout.createClient<Api>({
    baseUrl: `http://localhost:${PORT}/api`,
  });

  await apiClient.getAuthStatus();
  await apiClient.checkPin({ pin: '123456' });
  await apiClient.logOut();

  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    electionHash: undefined,
  });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash: undefined },
    { pin: '123456' }
  );
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {
    electionHash: undefined,
  });
});

test('setElectionResultsOfficial', async () => {
  const logger = fakeLogger();

  server = await start({ app, logger, workspace });
  const apiClient = grout.createClient<Api>({
    baseUrl: `http://localhost:${PORT}/api`,
  });

  await request(app)
    .post('/admin/elections')
    .set('Content-Type', 'application/json')
    .send(electionMinimalExhaustiveSampleDefinition)
    .expect(200);

  let elections = await request(app).get('/admin/elections').expect(200);
  expect(elections.body[0]).toMatchObject({ isOfficialResults: false });

  await apiClient.markResultsOfficial();
  elections = await request(app).get('/admin/elections').expect(200);
  expect(elections.body[0]).toMatchObject({ isOfficialResults: true });
});
