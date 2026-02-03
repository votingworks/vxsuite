import { afterAll, describe, expect, test } from 'vitest';
import { v4 as uuid } from 'uuid';
import { ElectionId } from '@votingworks/types';
import { testSetupHelpers } from '../test/helpers';
import {
  organizations,
  jurisdictions,
  users,
  nonVxUser,
  nonVxJurisdiction,
} from '../test/mocks';

const { setupApp, cleanup } = testSetupHelpers();

afterAll(async () => {
  await cleanup();
});

async function createElectionForTest(
  apiClient: { createElection: (params: { id: ElectionId; jurisdictionId: string }) => Promise<{ unsafeUnwrap: () => ElectionId }> },
): Promise<ElectionId> {
  const electionId = uuid() as ElectionId;
  (await apiClient.createElection({
    id: electionId,
    jurisdictionId: nonVxJurisdiction.id,
  })).unsafeUnwrap();
  return electionId;
}

describe('Export QA Webhook', () => {
  test('webhook endpoint requires valid secret', async () => {
    const { workspace, apiClient, auth0, app } =
      await setupApp({
        organizations,
        jurisdictions,
        users,
      });

    auth0.setLoggedInUser(nonVxUser);

    // Create an election and a QA run
    const electionId = await createElectionForTest(apiClient);
    const qaRunId = uuid();
    await workspace.store.createExportQaRun({
      id: qaRunId,
      electionId,
      exportPackageUrl: 'https://example.com/package.zip',
    });

    // Test without secret header
    const responseWithoutSecret = await app.request
      .post(`/api/export-qa-webhook/${qaRunId}`)
      .send({
        status: 'in_progress',
      });

    expect(responseWithoutSecret.status).toBe(401);
    expect(responseWithoutSecret.body).toEqual({ error: 'Unauthorized' });

    // Test with wrong secret
    const responseWithWrongSecret = await app.request
      .post(`/api/export-qa-webhook/${qaRunId}`)
      .set('X-Webhook-Secret', 'wrong-secret')
      .send({
        status: 'in_progress',
      });

    expect(responseWithWrongSecret.status).toBe(401);
    expect(responseWithWrongSecret.body).toEqual({ error: 'Unauthorized' });
  });

  test('webhook endpoint validates QA run exists', async () => {
    const { app } = await setupApp({
      organizations,
      jurisdictions,
      users,
      env: {
        CIRCLECI_WEBHOOK_SECRET: 'test-secret',
      },
    });

    const nonExistentQaRunId = uuid();

    const response = await app.request
      .post(`/api/export-qa-webhook/${nonExistentQaRunId}`)
      .set('X-Webhook-Secret', 'test-secret')
      .send({
        status: 'in_progress',
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'QA run not found' });
  });

  test('webhook endpoint validates request body', async () => {
    const { workspace, apiClient, auth0, app } = await setupApp({
      organizations,
      jurisdictions,
      users,
      env: {
        CIRCLECI_WEBHOOK_SECRET: 'test-secret',
      },
    });

    auth0.setLoggedInUser(nonVxUser);

    // Create an election and a QA run
    const electionId = await createElectionForTest(apiClient);
    const qaRunId = uuid();
    await workspace.store.createExportQaRun({
      id: qaRunId,
      electionId,
      exportPackageUrl: 'https://example.com/package.zip',
    });

    // Test with invalid status
    const responseInvalidStatus = await app.request
      .post(`/api/export-qa-webhook/${qaRunId}`)
      .set('X-Webhook-Secret', 'test-secret')
      .send({
        status: 'invalid-status',
      });

    expect(responseInvalidStatus.status).toBe(400);
    expect(responseInvalidStatus.body).toEqual({ error: 'Invalid request body' });

    // Test with missing status
    const responseMissingStatus = await app.request
      .post(`/api/export-qa-webhook/${qaRunId}`)
      .set('X-Webhook-Secret', 'test-secret')
      .send({});

    expect(responseMissingStatus.status).toBe(400);
    expect(responseMissingStatus.body).toEqual({ error: 'Invalid request body' });
  });

  test('webhook endpoint updates QA run status', async () => {
    const { workspace, apiClient, auth0, app } = await setupApp({
      organizations,
      jurisdictions,
      users,
      env: {
        CIRCLECI_WEBHOOK_SECRET: 'test-secret',
      },
    });

    auth0.setLoggedInUser(nonVxUser);

    // Create an election and a QA run
    const electionId = await createElectionForTest(apiClient);
    const qaRunId = uuid();
    await workspace.store.createExportQaRun({
      id: qaRunId,
      electionId,
      exportPackageUrl: 'https://example.com/package.zip',
    });

    // Update to in_progress
    const responseInProgress = await app.request
      .post(`/api/export-qa-webhook/${qaRunId}`)
      .set('X-Webhook-Secret', 'test-secret')
      .send({
        status: 'in_progress',
        statusMessage: 'Running tests',
        circleCiWorkflowId: 'workflow-123',
        jobUrl: 'https://app.circleci.com/pipelines/gh/org/repo/123/workflows/abc/jobs/456',
      });

    expect(responseInProgress.status).toBe(200);
    expect(responseInProgress.body).toEqual({ success: true });

    let qaRun = await workspace.store.getExportQaRun(qaRunId);
    expect(qaRun).toMatchObject({
      id: qaRunId,
      electionId,
      status: 'in_progress',
      statusMessage: 'Running tests',
      circleCiWorkflowId: 'workflow-123',
      jobUrl: 'https://app.circleci.com/pipelines/gh/org/repo/123/workflows/abc/jobs/456',
    });

    // Update to success
    const responseSuccess = await app.request
      .post(`/api/export-qa-webhook/${qaRunId}`)
      .set('X-Webhook-Secret', 'test-secret')
      .send({
        status: 'success',
        statusMessage: 'All tests passed',
        resultsUrl: 'https://example.com/results.html',
      });

    expect(responseSuccess.status).toBe(200);
    expect(responseSuccess.body).toEqual({ success: true });

    qaRun = await workspace.store.getExportQaRun(qaRunId);
    expect(qaRun).toMatchObject({
      id: qaRunId,
      electionId,
      status: 'success',
      statusMessage: 'All tests passed',
      resultsUrl: 'https://example.com/results.html',
    });
  });

  test('webhook endpoint handles failure status', async () => {
    const { workspace, apiClient, auth0, app } = await setupApp({
      organizations,
      jurisdictions,
      users,
      env: {
        CIRCLECI_WEBHOOK_SECRET: 'test-secret',
      },
    });

    auth0.setLoggedInUser(nonVxUser);

    // Create an election and a QA run
    const electionId = await createElectionForTest(apiClient);
    const qaRunId = uuid();
    await workspace.store.createExportQaRun({
      id: qaRunId,
      electionId,
      exportPackageUrl: 'https://example.com/package.zip',
    });

    // Update to failure
    const response = await app.request
      .post(`/api/export-qa-webhook/${qaRunId}`)
      .set('X-Webhook-Secret', 'test-secret')
      .send({
        status: 'failure',
        statusMessage: 'Tests failed: 3 errors found',
        resultsUrl: 'https://example.com/results.html',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const qaRun = await workspace.store.getExportQaRun(qaRunId);
    expect(qaRun).toMatchObject({
      id: qaRunId,
      electionId,
      status: 'failure',
      statusMessage: 'Tests failed: 3 errors found',
      resultsUrl: 'https://example.com/results.html',
    });
  });
});
