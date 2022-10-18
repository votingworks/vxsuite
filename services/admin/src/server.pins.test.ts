import { Application } from 'express';
import request from 'supertest';
import { dirSync } from 'tmp';

import { generatePin } from '@votingworks/utils';
import { mockOf } from '@votingworks/test-utils';

import { buildApp } from './server';
import { createWorkspace, Workspace } from './util/workspace';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    generatePin: jest.fn(),
  };
});

let app: Application;
let workspace: Workspace;

beforeEach(() => {
  mockOf(generatePin).mockReset();

  workspace = createWorkspace(dirSync().name);
  app = buildApp({ workspace });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('POST admin/pins/generate-card-pin', () => {
  test('returns randomly generated PIN', async () => {
    mockOf(generatePin).mockReturnValueOnce('121212');

    await request(app).post(`/admin/pins/generate-card-pin`).expect(200, {
      status: 'ok',
      pin: '121212',
    });
  });
});
