import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import {
  LocalFileStorageClient,
  S3FileStorageClient,
} from './file_storage_client.js';

const mockWorkspace = vi.hoisted(() => ({ root: '' }));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

vi.mock(import('./globals.js'), async (importActual) => ({
  ...(await importActual()),
  get WORKSPACE() {
    return mockWorkspace.root;
  },
}));

const mockedS3GetSignedUrl = vi.mocked(s3GetSignedUrl);

describe('S3FileStorageClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AWS_S3_REGION: 'us-east-1',
      AWS_S3_BUCKET_NAME: 'test-bucket',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('getSignedUrl generates a presigned URL with default expiration', async () => {
    const expectedUrl =
      'https://test-bucket.s3.amazonaws.com/path/to/file.zip?X-Amz-Signature=abc123';
    mockedS3GetSignedUrl.mockResolvedValueOnce(expectedUrl);

    const client = new S3FileStorageClient();
    const url = await client.getSignedUrl('path/to/file.zip');

    expect(url).toEqual(expectedUrl);
    expect(mockedS3GetSignedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.any(GetObjectCommand),
      { expiresIn: 3600 }
    );
  });

  test('getSignedUrl accepts a custom expiration', async () => {
    const expectedUrl =
      'https://test-bucket.s3.amazonaws.com/path/to/file.zip?X-Amz-Signature=abc123';
    mockedS3GetSignedUrl.mockResolvedValueOnce(expectedUrl);

    const client = new S3FileStorageClient();
    const url = await client.getSignedUrl('path/to/file.zip', 7200);

    expect(url).toEqual(expectedUrl);
    expect(mockedS3GetSignedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.any(GetObjectCommand),
      { expiresIn: 7200 }
    );
  });

  test('getSignedUrl passes the correct bucket and key', async () => {
    mockedS3GetSignedUrl.mockResolvedValueOnce('https://example.com/signed');

    const client = new S3FileStorageClient();
    await client.getSignedUrl('jurisdictions/123/election-package.zip');

    const command = mockedS3GetSignedUrl.mock.calls[0]![1] as GetObjectCommand;
    expect(command.input).toEqual({
      Bucket: 'test-bucket',
      Key: 'jurisdictions/123/election-package.zip',
    });
  });
});

describe('LocalFileStorageClient', () => {
  beforeEach(() => {
    mockWorkspace.root = mkdtempSync(join(tmpdir(), 'hub-file-storage-'));
  });

  afterEach(() => {
    rmSync(mockWorkspace.root, { recursive: true, force: true });
  });

  test('streamFile writes under the root and readFile reads it back', async () => {
    const client = new LocalFileStorageClient();
    await client.streamFile(
      'jurisdiction-1/ballots.zip',
      Readable.from('contents')
    );

    expect(
      readFileSync(
        join(mockWorkspace.root, 'jurisdiction-1/ballots.zip'),
        'utf8'
      )
    ).toEqual('contents');

    const readResult = await client.readFile('jurisdiction-1/ballots.zip');
    expect(await text(readResult.unsafeUnwrap())).toEqual('contents');
  });

  test('readFile and streamFile reject paths outside the root', async () => {
    const client = new LocalFileStorageClient();

    expect(() => client.readFile('jurisdiction-1/../../outside.txt')).toThrow(
      'file path escapes storage root'
    );
    await expect(
      client.streamFile('../outside.txt', Readable.from('contents'))
    ).rejects.toThrow('file path escapes storage root');
    expect(() => client.readFile('.')).toThrow(
      'file path escapes storage root'
    );
  });
});
