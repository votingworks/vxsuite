import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3FileStorageClient } from './file_storage_client';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
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
    const expectedUrl = 'https://test-bucket.s3.amazonaws.com/path/to/file.zip?X-Amz-Signature=abc123';
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
    const expectedUrl = 'https://test-bucket.s3.amazonaws.com/path/to/file.zip?X-Amz-Signature=abc123';
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
