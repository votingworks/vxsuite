import { Buffer } from 'node:buffer';
import { Stream } from 'node:stream';
import ZipStream from 'zip-stream';

/**
 * File contents that can be added to a zip stream
 */
export type ZippableContents = Buffer | Stream | NodeJS.ReadableStream | string;

/**
 * A promisified version of ZipStream.entry
 */
export function addFileToZipStream(
  zipStream: ZipStream,
  file: { path: string; contents: ZippableContents }
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    zipStream.entry(
      // NodeJS.ReadableStream is structurally compatible with the streams that
      // ZipStream.entry accepts
      file.contents as Buffer | Stream | string,
      { name: file.path },
      (error) => {
        /* istanbul ignore next - trivial error case */
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Zips a set of files to an in-memory buffer. Intended for small file sets,
 * e.g. the files for a single cast vote record.
 */
export async function zipFilesToBuffer(
  files: Array<{ path: string; contents: ZippableContents }>
): Promise<Buffer> {
  const zipStream = new ZipStream();
  const chunks: Buffer[] = [];
  zipStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<void>((resolve, reject) => {
    zipStream.on('end', resolve);
    zipStream.on('error', reject);
  });
  for (const file of files) {
    await addFileToZipStream(zipStream, file);
  }
  zipStream.finalize();
  await finished;
  return Buffer.concat(chunks);
}
