import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { assert, ok, type Result } from '@votingworks/basics';

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
 * A file storage client that uses the local file system
 */
export class LocalFileStorageClient implements FileStorageClient {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
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
