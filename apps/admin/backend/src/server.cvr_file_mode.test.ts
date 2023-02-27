import { Admin } from '@votingworks/api';
import {
  buildMockDippedSmartCardAuth,
  DippedSmartCardAuthApi,
} from '@votingworks/auth';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { mockOf } from '@votingworks/test-utils';
import { Application } from 'express';
import request from 'supertest';
import { dirSync } from 'tmp';
import { setElection } from '../test/server';
import { buildApp } from './server';
import { createWorkspace, Workspace } from './util/workspace';

let app: Application;
let auth: DippedSmartCardAuthApi;
let workspace: Workspace;

beforeEach(async () => {
  jest.restoreAllMocks();

  auth = buildMockDippedSmartCardAuth();

  workspace = createWorkspace(dirSync().name);
  workspace.store.getCurrentCvrFileModeForElection = jest.fn();

  app = buildApp({ auth, workspace });

  await setElection(
    app,
    electionMinimalExhaustiveSampleFixtures.electionDefinition
  );
});

test('responds with CVR file mode from store', async () => {
  const mockGetCurrentCvrFileMode = mockOf(
    workspace.store.getCurrentCvrFileModeForElection
  );

  mockGetCurrentCvrFileMode.mockReturnValueOnce(Admin.CvrFileMode.Unlocked);
  await request(app)
    .get(`/admin/elections/cvr-file-mode`)
    .expect(200, { status: 'ok', cvrFileMode: Admin.CvrFileMode.Unlocked });

  mockGetCurrentCvrFileMode.mockReturnValueOnce(Admin.CvrFileMode.Test);
  await request(app)
    .get(`/admin/elections/cvr-file-mode`)
    .expect(200, { status: 'ok', cvrFileMode: Admin.CvrFileMode.Test });

  mockGetCurrentCvrFileMode.mockReturnValueOnce(Admin.CvrFileMode.Official);
  await request(app)
    .get(`/admin/elections/cvr-file-mode`)
    .expect(200, { status: 'ok', cvrFileMode: Admin.CvrFileMode.Official });
});
