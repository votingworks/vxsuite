import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { ok, type Result } from '@votingworks/basics';

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

export class LocalDirectoryFileStorageClient implements FileStorageClient {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  resolvePath(filePath: string): string {
    return path.join(this.root, filePath);
  }

  readFile(
    filePath: string
  ): Promise<Result<Readable, FileStorageClientError>> {
    return Promise.resolve(ok(createReadStream(this.resolvePath(filePath))));
  }

  async streamFile(filePath: string, contents: Readable): Promise<void> {
    const completeFilePath = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(completeFilePath), { recursive: true });
    await fs.writeFile(completeFilePath, contents);
  }
}
