import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest';
import { CircleCiClient } from './circleci_client.js';
import { QaConfig } from './qa_config.js';

const config: QaConfig = {
  apiBaseUrl: 'https://circleci.com',
  apiToken: 'test-token',
  projectSlug: 'gh/org/repo',
  webhookSecret: 'test-secret',
};

describe('CircleCiClient', () => {
  let mockFetch: Mock<typeof fetch>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  test('triggerPipeline makes correct API request', async () => {
    const mockResponse = {
      id: 'pipeline-123',
      number: 456,
      state: 'pending',
      created_at: '2024-01-01T00:00:00Z',
    } as const;

    const fakeResponse: Partial<Response> = {
      ok: true,
      json: () => Promise.resolve(mockResponse),
    };
    mockFetch.mockResolvedValueOnce(fakeResponse as Response);

    const client = new CircleCiClient(config);
    const result = await client.triggerPipeline({
      exportPackageUrl: 'https://example.com/package.zip',
      webhookUrl: 'https://example.com/webhook',
      qaRunId: 'qa-run-123',
      electionId: 'election-123',
      vxsuiteVersion: 'v4.1',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://circleci.com/api/v2/project/gh/org/repo/pipeline',
      {
        method: 'POST',
        headers: {
          'Circle-Token': 'test-token',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          parameters: {
            export_package_url: 'https://example.com/package.zip',
            webhook_url: 'https://example.com/webhook',
            qa_run_id: 'qa-run-123',
            election_id: 'election-123',
            vxsuite_version: 'v4.1',
          },
        }),
      }
    );

    expect(result).toEqual({
      pipelineId: 'pipeline-123',
      pipelineNumber: 456,
      state: 'pending',
      createdAt: '2024-01-01T00:00:00Z',
    });
  });

  test('triggerPipeline handles API errors', async () => {
    const fakeResponse: Partial<Response> = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid token'),
    };
    mockFetch.mockResolvedValueOnce(fakeResponse as Response);

    const client = new CircleCiClient(config);
    await expect(
      client.triggerPipeline({
        exportPackageUrl: 'https://example.com/package.zip',
        webhookUrl: 'https://example.com/webhook',
        qaRunId: 'qa-run-123',
        electionId: 'election-123',
        vxsuiteVersion: 'v4.1',
      })
    ).rejects.toThrow('CircleCI API request failed: 401 Unauthorized');
  });

  test('triggerPipeline handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const client = new CircleCiClient(config);
    await expect(
      client.triggerPipeline({
        exportPackageUrl: 'https://example.com/package.zip',
        webhookUrl: 'https://example.com/webhook',
        qaRunId: 'qa-run-123',
        electionId: 'election-123',
        vxsuiteVersion: 'v4.1',
      })
    ).rejects.toThrow('Network error');
  });

  test('triggerPipeline honors the branch and API base URL from config', async () => {
    const fakeResponse: Partial<Response> = {
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'pipeline-123',
          number: 456,
          state: 'pending',
          created_at: '2024-01-01T00:00:00Z',
        }),
    };
    mockFetch.mockResolvedValueOnce(fakeResponse as Response);

    const client = new CircleCiClient({
      ...config,
      apiBaseUrl: 'http://localhost:9000',
      branch: 'some-branch',
    });
    await client.triggerPipeline({
      exportPackageUrl: 'https://example.com/package.zip',
      webhookUrl: 'https://example.com/webhook',
      qaRunId: 'qa-run-123',
      electionId: 'election-123',
      vxsuiteVersion: 'v4.1',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9000/api/v2/project/gh/org/repo/pipeline',
      expect.objectContaining({
        body: expect.stringContaining('"branch":"some-branch"'),
      })
    );
  });

  test('pipelineUrl links to the pipeline in the configured project', () => {
    expect(new CircleCiClient(config).pipelineUrl(456)).toEqual(
      'https://app.circleci.com/pipelines/gh/org/repo/456'
    );
  });
});
