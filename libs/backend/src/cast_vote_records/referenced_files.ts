import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import { sha256 } from 'js-sha256';
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
  ReferencedFileType,
  safeParseJson,
  SheetOf,
} from '@votingworks/types';

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

function referencedFile(input: {
  expectedFileHash: string;
  filePath: string;
  fileType: ReferencedFileType;
}): ReferencedFile<Buffer> {
  return {
    read: async () => {
      let fileContents: Buffer;
      try {
        fileContents = await fs.readFile(input.filePath);
      } catch (error) {
        if (isNonExistentFileOrDirectoryError(error)) {
          return err({
            type: 'invalid-cast-vote-record',
            subType: `${input.fileType}-not-found`,
          });
        }
        return err({
          type: 'invalid-cast-vote-record',
          subType: `${input.fileType}-read-error`,
        });
      }

      if (sha256(fileContents) !== input.expectedFileHash) {
        return err({
          type: 'invalid-cast-vote-record',
          subType: `incorrect-${input.fileType}-hash`,
        });
      }

      return ok(fileContents);
    },
  };
}

/**
 * An image referenced by a cast vote record report. When read, the image's hash will be checked
 * against the hash in the cast vote record report.
 */
export function referencedImageFile(input: {
  expectedFileHash: string;
  filePath: string;
}): ReferencedFile<Buffer> {
  return referencedFile({
    ...input,
    fileType: 'image',
  });
}

/**
 * A layout file referenced by a cast vote record report. When read, the layout file's hash will be
 * checked against the hash in the cast vote record report.
 */
export function referencedLayoutFile(input: {
  expectedFileHash: string;
  filePath: string;
}): ReferencedFile<BallotPageLayout> {
  const file = referencedFile({
    ...input,
    fileType: 'layout-file',
  });
  return {
    read: async () => {
      const readResult = await file.read();
      if (readResult.isErr()) {
        return readResult;
      }
      const layoutFileContents = readResult.ok().toString('utf-8');

      const parseResult = safeParseJson(
        layoutFileContents,
        BallotPageLayoutSchema
      );
      if (parseResult.isErr()) {
        return err({
          type: 'invalid-cast-vote-record',
          subType: 'layout-file-parse-error',
        });
      }
      const layout = parseResult.ok();

      return ok(layout);
    },
  };
}
