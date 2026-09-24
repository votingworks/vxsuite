import type { Buffer } from 'node:buffer';
import type { Stream } from 'node:stream';
import type ZipStream from 'zip-stream';

/**
 * A promisified version of ZipStream.entry
 */
export function addFileToZipStream(
  zipStream: ZipStream,
  file: { path: string; contents: Buffer | Stream | string }
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    zipStream.entry(file.contents, { name: file.path }, (error) => {
      // @coverage-exclude: trivial error case
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
