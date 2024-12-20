import { Result, err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { open } from './open_file';

/**
 * Possible errors that can occur when reading a file.
 */
export type ReadFileError =
  | { type: 'OpenFileError'; error: globalThis.Error }
  | { type: 'FileExceedsMaxSize'; maxSize: number; fileSize: number }
  | { type: 'ReadFileError'; error: globalThis.Error };

/**
 * Reads the entire contents of a file. If the file is larger than `maxSize`
 * then an error is returned without reading the file.
 *
 * @param path The path to the file to read.
 * @param maxSize The maximum size of the file to read in bytes.
 */
export async function readFile(
  path: string,
  { maxSize }: { maxSize: number }
): Promise<Result<Buffer, ReadFileError>>;
/**
 * Reads the entire contents of a file. If the file is larger than `maxSize`
 * then an error is returned without reading the file.
 *
 * @param path The path to the file to read.
 * @param maxSize The maximum size of the file to read in bytes.
 */
export async function readFile(
  path: string,
  { maxSize, encoding }: { maxSize: number; encoding: BufferEncoding }
): Promise<Result<string, ReadFileError>>;
/**
 * Reads the entire contents of a file. If the file is larger than `maxSize`
 * then an error is returned without reading the file.
 *
 * @param path The path to the file to read.
 * @param maxSize The maximum size of the file to read in bytes.
 */
export async function readFile(
  path: string,
  { maxSize, encoding }: { maxSize: number; encoding?: BufferEncoding }
): Promise<Result<Buffer | string, ReadFileError>> {
  if (maxSize < 0) {
    throw new Error('maxSize must be non-negative');
  }

  const openResult = await open(path);

  if (openResult.isErr()) {
    return err({ type: 'OpenFileError', error: openResult.err() });
  }

  const fd = openResult.ok();
  const stat = await fd.stat();

  if (stat.size > maxSize) {
    await fd.close();
    return err({
      type: 'FileExceedsMaxSize',
      maxSize,
      fileSize: stat.size,
    });
  }

  const buffer = Buffer.allocUnsafe(stat.size);
  const readResult = await fd.read(buffer, 0, stat.size, 0);

  /* istanbul ignore next - @preserve */
  if (readResult.bytesRead !== stat.size) {
    await fd.close();
    return err({
      type: 'ReadFileError',
      error: new Error(
        `unexpected number of bytes read: ${readResult.bytesRead} instead of ${stat.size}`
      ),
    });
  }

  await fd.close();
  return ok(encoding ? buffer.toString(encoding) : buffer);
}
