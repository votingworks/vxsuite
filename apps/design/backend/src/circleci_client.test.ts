import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CircleCiClient } from './circleci_client';

describe('CircleCiClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  test('isConfigured returns false when not configured', () => {
    const client = new CircleCiClient('', '');
    expect(client.isConfigured()).toEqual(false);
  });

  test('isConfigured returns false when only token is provided', () => {
    const client = new CircleCiClient('test-token', '');
    expect(client.isConfigured()).toEqual(false);
  });

  test('isConfigured returns false when only project slug is provided', () => {
    const client = new CircleCiClient('', 'gh/org/repo');
    expect(client.isConfigured()).toEqual(false);
  });

  test('isConfigured returns true when both token and project slug are provided', () => {
    const client = new CircleCiClient('test-token', 'gh/org/repo');
    expect(client.isConfigured()).toEqual(true);
  });

  test('triggerPipeline throws error when not configured', async () => {
    const client = new CircleCiClient('', '');
    await expect(
      client.triggerPipeline({
        exportPackageUrl: 'https://example.com/package.zip',
        webhookUrl: 'https://example.com/webhook',
        qaRunId: 'qa-run-123',
        electionId: 'election-123',
      })
    ).rejects.toThrow('CircleCI client is not configured');
  });

  test('triggerPipeline makes correct API request', async () => {
    const mockResponse = {
      id: 'pipeline-123',
      number: 456,
      state: 'pending',
      created_at: '2024-01-01T00:00:00Z',
    } as const;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const client = new CircleCiClient('test-token', 'gh/org/repo');
    const result = await client.triggerPipeline({
      exportPackageUrl: 'https://example.com/package.zip',
      webhookUrl: 'https://example.com/webhook',
      qaRunId: 'qa-run-123',
      electionId: 'election-123',
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
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid token'),
    });

    const client = new CircleCiClient('test-token', 'gh/org/repo');
    await expect(
      client.triggerPipeline({
        exportPackageUrl: 'https://example.com/package.zip',
        webhookUrl: 'https://example.com/webhook',
        qaRunId: 'qa-run-123',
        electionId: 'election-123',
      })
    ).rejects.toThrow('CircleCI API request failed: 401 Unauthorized');
  });

  test('triggerPipeline handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const client = new CircleCiClient('test-token', 'gh/org/repo');
    await expect(
      client.triggerPipeline({
        exportPackageUrl: 'https://example.com/package.zip',
        webhookUrl: 'https://example.com/webhook',
        qaRunId: 'qa-run-123',
        electionId: 'election-123',
      })
    ).rejects.toThrow('Network error');
  });
});
