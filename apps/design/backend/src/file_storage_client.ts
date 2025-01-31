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
import { assertDefined } from '@votingworks/basics';

import { WORKSPACE } from './globals';

export interface FileStorageClient {
  readFile: (filePath: string) => Promise<Readable>;
  writeFile: (filePath: string, contents: Buffer) => Promise<void>;
}

/**
 * A file storage client backed by S3, for deployed environments
 */
export class S3FileStorageClient {
  private readonly s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({ region: process.env.AWS_S3_REGION });
  }

  async readFile(filePath: string): Promise<Readable> {
    const data = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: filePath,
      })
    );
    return (data.Body ?? Readable.from([])) as Readable;
  }

  async writeFile(filePath: string, contents: Buffer): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: filePath,
        Body: contents,
      })
    );
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

  readFile(filePath: string): Promise<Readable> {
    return Promise.resolve(createReadStream(path.join(this.root, filePath)));
  }

  async writeFile(filePath: string, contents: Buffer): Promise<void> {
    const completeFilePath = path.join(this.root, filePath);
    await fs.mkdir(path.dirname(completeFilePath), { recursive: true });
    return fs.writeFile(completeFilePath, contents);
  }
}
