// eslint-disable-next-line max-classes-per-file
import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { assertDefined, err, ok, Result } from '@votingworks/basics';

import { WORKSPACE } from './globals';

// TODO: Properly enumerate error cases with FileStorageClientError type
export type FileStorageClientError =
  | { type: 'undefined-body' }
  | { type: 'unknown-error' };

export interface FileStorageClient {
  readFile: (
    filePath: string
  ) => Promise<Result<Readable, FileStorageClientError>>;
  writeFile: (
    filePath: string,
    contents: Buffer
  ) => Promise<Result<void, FileStorageClientError>>;
}

/**
 * A file storage client backed by S3, for deployed environments
 */
export class S3FileStorageClient {
  private readonly s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({ region: process.env.AWS_S3_REGION });
  }

  async readFile(
    filePath: string
  ): Promise<Result<Readable, FileStorageClientError>> {
    const data = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: filePath,
      })
    );
    if (!data.Body) {
      return err({ type: 'undefined-body' });
    }
    return ok(data.Body as Readable);
  }

  async writeFile(
    filePath: string,
    contents: Buffer
  ): Promise<Result<void, FileStorageClientError>> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: filePath,
        Body: contents,
      })
    );
    return ok();
  }
}

/**
 * A file storage client that uses the local file system, for local development
 */
export class LocalFileStorageClient {
  private readonly root: string;

  constructor() {
    this.root = assertDefined(WORKSPACE);
  }

  readFile(
    filePath: string
  ): Promise<Result<Readable, FileStorageClientError>> {
    return Promise.resolve(
      ok(createReadStream(path.join(this.root, filePath)))
    );
  }

  async writeFile(
    filePath: string,
    contents: Buffer
  ): Promise<Result<void, FileStorageClientError>> {
    const completeFilePath = path.join(this.root, filePath);
    await fs.mkdir(path.dirname(completeFilePath), { recursive: true });
    await fs.writeFile(completeFilePath, contents);
    return ok();
  }
}
