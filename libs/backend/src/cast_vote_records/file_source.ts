import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Where a single cast vote record's file set (report, images, layouts) is
 * read from. File names are relative to the record, as they appear in the
 * report's `BallotImage` locations.
 *
 * `readFile` rejects with an `ENOENT`-coded error for a missing file, like
 * `fs.readFile`, so callers can treat both sources alike.
 */
export interface CastVoteRecordFileSource {
  readFile(fileName: string): Promise<Buffer>;
}

/** A record's files as exported to a directory (e.g. on a USB drive). */
export function directoryFileSource(
  directoryPath: string
): CastVoteRecordFileSource {
  return {
    readFile: (fileName) => fs.readFile(path.join(directoryPath, fileName)),
  };
}

/** A record's files already held in memory (e.g. received over the network). */
export function inMemoryFileSource(
  files: Readonly<Record<string, Buffer>>
): CastVoteRecordFileSource {
  return {
    readFile: (fileName) => {
      const contents = files[fileName];
      if (!contents) {
        return Promise.reject(
          Object.assign(new Error(`ENOENT: no such file: ${fileName}`), {
            code: 'ENOENT',
          })
        );
      }
      return Promise.resolve(contents);
    },
  };
}
