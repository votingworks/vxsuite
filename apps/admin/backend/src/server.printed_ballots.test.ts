import { Admin } from '@votingworks/api';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { unsafeParse } from '@votingworks/types';
import { assert, assertDefined, typedAs } from '@votingworks/basics';
import { Application } from 'express';
import request from 'supertest';
import { dirSync } from 'tmp';
import { buildApp } from './server';
import { createWorkspace, Workspace } from './util/workspace';
import { setElection } from '../test/server';

let app: Application;
let auth: DippedSmartCardAuthApi;
let workspace: Workspace;

beforeEach(async () => {
  jest.restoreAllMocks();
  auth = buildMockDippedSmartCardAuth();
  workspace = createWorkspace(dirSync().name);
  app = buildApp({ auth, workspace });

  await setElection(
    app,
    electionMinimalExhaustiveSampleFixtures.electionDefinition
  );
});

test('printed ballots', async () => {
  const electionId = assertDefined(workspace.store.getCurrentElectionId());

  await request(app)
    .get(`/admin/elections/printed-ballots?bad=query`)
    .expect(400);

  await request(app)
    .post(`/admin/elections/printed-ballots`)
    .send({ bad: 'body' })
    .expect(400);

  await request(app)
    .get(`/admin/elections/printed-ballots`)
    .expect(200, { status: 'ok', printedBallots: [] });

  const response = await request(app)
    .post(`/admin/elections/printed-ballots`)
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
      `/admin/elections/printed-ballots?ballotMode=${Admin.BallotMode.Sample}`
    )
    .expect(200, { status: 'ok', printedBallots: [] });
});
