// eslint-disable-next-line max-classes-per-file
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  assert,
  assertDefined,
  err,
  ok,
  type Result,
} from '@votingworks/basics';

import { WORKSPACE } from './globals.js';

// TODO: Properly enumerate error cases with FileStorageClientError type
export type FileStorageClientError =
  | { type: 'undefined-body' }
  | { type: 'unknown-error' };

export interface FileStorageClient {
  readFile: (
    filePath: string
  ) => Promise<Result<Readable, FileStorageClientError>>;

  streamFile: (filePath: string, contents: Readable) => Promise<void>;

  getSignedUrl?: (
    filePath: string,
    expiresInSeconds?: number
  ) => Promise<string>;
}

/**
 * A file storage client that uses the local file system, for local development
 */
export class LocalFileStorageClient {
  private readonly root: string;

  constructor() {
    this.root = assertDefined(WORKSPACE);
  }

  private resolveWithinRoot(filePath: string): string {
    const resolvedPath = path.resolve(this.root, filePath);
    assert(
      resolvedPath.startsWith(path.resolve(this.root) + path.sep),
      `file path escapes storage root: ${filePath}`
    );
    return resolvedPath;
  }

  readFile(
    filePath: string
  ): Promise<Result<Readable, FileStorageClientError>> {
    return Promise.resolve(
      ok(createReadStream(this.resolveWithinRoot(filePath)))
    );
  }

  async streamFile(filePath: string, contents: Readable): Promise<void> {
    const completeFilePath = this.resolveWithinRoot(filePath);
    await fs.mkdir(path.dirname(completeFilePath), { recursive: true });
    await fs.writeFile(completeFilePath, contents);
  }
}
