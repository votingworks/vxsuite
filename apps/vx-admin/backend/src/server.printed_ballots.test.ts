import { Admin } from '@votingworks/api';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { unsafeParse } from '@votingworks/types';
import { assert, typedAs } from '@votingworks/basics';
import { Application } from 'express';
import request from 'supertest';
import { dirSync } from 'tmp';
import { buildApp } from './server';
import { buildMockAuth } from '../test/utils';
import { createWorkspace, Workspace } from './util/workspace';

let app: Application;
let auth: DippedSmartCardAuthApi;
let workspace: Workspace;

beforeEach(() => {
  jest.restoreAllMocks();
  auth = buildMockAuth();
  workspace = createWorkspace(dirSync().name);
  app = buildApp({ auth, workspace });
});

test('printed ballots', async () => {
  await request(app)
    .get(`/admin/elections/unknown-election-id/printed-ballots`)
    .expect(404);

  await request(app)
    .post(`/admin/elections/unknown-election-id/printed-ballots`)
    .expect(404);

  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  await request(app)
    .get(`/admin/elections/${electionId}/printed-ballots?bad=query`)
    .expect(400);

  await request(app)
    .post(`/admin/elections/${electionId}/printed-ballots`)
    .send({ bad: 'body' })
    .expect(400);

  await request(app)
    .get(`/admin/elections/${electionId}/printed-ballots`)
    .expect(200, { status: 'ok', printedBallots: [] });

  const response = await request(app)
    .post(`/admin/elections/${electionId}/printed-ballots`)
    .send(
      typedAs<Admin.PrintedBallot>({
        ballotStyleId: '12',
        precinctId: '23',
        locales: { primary: 'en-US' },
        ballotMode: Admin.BallotMode.Official,
        ballotType: 'standard',
        numCopies: 4,
      })
    )
    .expect(200);

  const responseBody = unsafeParse(
    Admin.PostPrintedBallotResponseSchema,
    response.body
  );

  assert(responseBody.status === 'ok');
  const { id } = responseBody;

  expect(workspace.store.getPrintedBallots(electionId)).toEqual([
    expect.objectContaining(
      typedAs<Partial<Admin.PrintedBallotRecord>>({ id, electionId })
    ),
  ]);

  await request(app)
    .get(
      `/admin/elections/${electionId}/printed-ballots?ballotMode=${Admin.BallotMode.Sample}`
    )
    .expect(200, { status: 'ok', printedBallots: [] });
});
