/* eslint-disable max-classes-per-file */
import { Buffer } from 'buffer';
import fs from 'fs/promises';
import {
  err,
  isNonExistentFileOrDirectoryError,
  ok,
  Result,
} from '@votingworks/basics';
import {
  BallotPageLayout,
  BallotPageLayoutSchema,
  ReadCastVoteRecordError,
  safeParseJson,
  SheetOf,
} from '@votingworks/types';
import { sha256 } from 'js-sha256';

/**
 * A file referenced by a cast vote record report
 */
export interface ReferencedFile<T> {
  read(): Promise<Result<T, ReadCastVoteRecordError>>;
}

/**
 * The files referenced by a cast vote record report
 */
export interface ReferencedFiles {
  imageFiles: SheetOf<ReferencedFile<Buffer>>;
  layoutFiles?: SheetOf<ReferencedFile<BallotPageLayout>>;
}

/**
 * An image referenced by a cast vote record report. When read, the image's hash will be checked
 * against the hash in the cast vote record report.
 */
export class ReferencedImageFile implements ReferencedFile<Buffer> {
  private readonly expectedFileHash: string;
  private readonly filePath: string;

  constructor(input: { expectedFileHash: string; filePath: string }) {
    this.expectedFileHash = input.expectedFileHash;
    this.filePath = input.filePath;
  }

  async read(): Promise<Result<Buffer, ReadCastVoteRecordError>> {
    let fileContents: Buffer;
    try {
      fileContents = await fs.readFile(this.filePath);
    } catch (error) {
      if (isNonExistentFileOrDirectoryError(error)) {
        return err({
          type: 'invalid-cast-vote-record',
          subType: 'image-not-found',
        });
      }
      return err({
        type: 'invalid-cast-vote-record',
        subType: 'image-read-error',
      });
    }

    if (sha256(fileContents) !== this.expectedFileHash) {
      return err({
        type: 'invalid-cast-vote-record',
        subType: 'incorrect-image-hash',
      });
    }

    return ok(fileContents);
  }
}

/**
 * A layout file referenced by a cast vote record report. When read, the layout file's hash will be
 * checked against the hash in the cast vote record report.
 */
export class ReferencedLayoutFile implements ReferencedFile<BallotPageLayout> {
  private readonly expectedFileHash: string;
  private readonly filePath: string;

  constructor(input: { expectedFileHash: string; filePath: string }) {
    this.expectedFileHash = input.expectedFileHash;
    this.filePath = input.filePath;
  }

  async read(): Promise<Result<BallotPageLayout, ReadCastVoteRecordError>> {
    let fileContents: string;
    try {
      fileContents = await fs.readFile(this.filePath, 'utf-8');
    } catch (error) {
      if (isNonExistentFileOrDirectoryError(error)) {
        return err({
          type: 'invalid-cast-vote-record',
          subType: 'layout-file-not-found',
        });
      }
      return err({
        type: 'invalid-cast-vote-record',
        subType: 'layout-file-read-error',
      });
    }

    if (sha256(fileContents) !== this.expectedFileHash) {
      return err({
        type: 'invalid-cast-vote-record',
        subType: 'incorrect-layout-file-hash',
      });
    }

    const parseResult = safeParseJson(fileContents, BallotPageLayoutSchema);
    if (parseResult.isErr()) {
      return err({
        type: 'invalid-cast-vote-record',
        subType: 'layout-file-parse-error',
      });
    }
    const layout = parseResult.ok();

    return ok(layout);
  }
}
