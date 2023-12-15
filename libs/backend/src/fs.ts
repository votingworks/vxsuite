import { Result, assert, err, ok } from '@votingworks/basics';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import { promisify } from 'util';

const fsReadFile = promisify(fs.readFile);

/**
 * The number of bytes in a megabyte.
 */
export const ONE_MEGABYTE = 1024 * 1024;

/**
 *
 */
export type ReadFileError =
  | { type: 'file-not-found'; path: string }
  | { type: 'file-too-large'; path: string; maxSize: number };

/**
 * The result of reading a file from the file system.
 */
export type ReadFileResult<T extends string | Buffer> = Result<
  T,
  ReadFileError
>;

/**
 * Reads a file from the file system up to a maximum size.
 *
 * @param path The path to the file to read.
 * @param options.maxSize The maximum size of the file to read.
 * @param options.encoding The encoding to use when reading the file, if any.
 * @returns A promise that resolves to the contents of the file.
 */
export async function readFile(
  path: string,
  options: { maxSize: number }
): Promise<ReadFileResult<Buffer>>;

/**
 * Reads a file from the file system up to a maximum size.
 *
 * @param path The path to the file to read.
 * @param options.maxSize The maximum size of the file to read.
 * @param options.encoding The encoding to use when reading the file, if any.
 * @returns A promise that resolves to the contents of the file.
 */
export async function readFile(
  path: string,
  options: { maxSize: number; encoding: BufferEncoding }
): Promise<ReadFileResult<string>>;

/**
 * Reads a file from the file system up to a maximum size.
 *
 * @param path The path to the file to read.
 * @param options.maxSize The maximum size of the file to read.
 * @param options.encoding The encoding to use when reading the file, if any.
 * @returns A promise that resolves to the contents of the file.
 */
export async function readFile(
  path: string,
  options: { maxSize: number; encoding?: BufferEncoding }
): Promise<ReadFileResult<string | Buffer>> {
  const { maxSize = ONE_MEGABYTE, encoding } = options ?? {};
  assert(maxSize > 0, 'maxSize must be greater than zero');
  assert(
    Number.isInteger(maxSize) || !Number.isFinite(maxSize),
    'maxSize must be an integer or Infinity'
  );

  if (!Number.isFinite(maxSize)) {
    return ok(await fsReadFile(path, { encoding }));
  }

  const input = fs.createReadStream(path, { encoding });

  return new Promise((resolve, reject) => {
    let bytesRead = 0;
    const chunks: unknown[] = [];

    input.on('readable', () => {
      // read one more byte than we need to find out if the file is too large
      const chunk = input.read(maxSize - bytesRead + 1);

      // if we've reached the end of the file, we're done
      if (chunk === null) {
        return;
      }

      if (Buffer.isBuffer(chunk)) {
        bytesRead += chunk.length;
      } else if (typeof chunk === 'string') {
        bytesRead += Buffer.byteLength(chunk);
      } else {
        throw new Error('Unexpected chunk type');
      }

      if (bytesRead > maxSize) {
        input.destroy();
        resolve(
          err({
            type: 'file-too-large',
            path,
            maxSize,
          })
        );
        return;
      }

      chunks.push(chunk);
    });

    input.on('error', (error) => {
      if ((error as { code?: string }).code === 'ENOENT') {
        resolve(
          err({
            type: 'file-not-found',
            path,
          })
        );
      } else {
        reject(error);
      }
    });

    input.on('end', () => {
      resolve(
        ok(encoding ? chunks.join('') : Buffer.concat(chunks as Buffer[]))
      );
    });
  });
}
