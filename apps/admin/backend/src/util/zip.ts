import { Buffer } from 'buffer';
import { Stream } from 'stream';
import ZipStream from 'zip-stream';

/**
 * A promisified version of ZipStream.entry
 */
export function addFileToZipStream(
  zipStream: ZipStream,
  file: { path: string; contents: Buffer | Stream | string }
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    zipStream.entry(file.contents, { name: file.path }, (error) => {
      /* istanbul ignore next - trivial error case */
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
