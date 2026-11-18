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
