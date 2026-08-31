import { assert, Result, err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { open } from './open_file';
import { FileExceedsMaxSizeError } from './file_exceeds_max_size_error';
import { ReadChunkError } from './read_chunk_error';
import { readChunksWithinLimit } from './read_chunks';

/**
 * Possible errors that can occur when reading a file.
 */
export type ReadFileError =
  | { type: 'OpenFileError'; error: globalThis.Error }
  | { type: 'FileExceedsMaxSize'; maxSize: number }
  | { type: 'ReadFileError'; error: globalThis.Error };

/**
 * Reads the entire contents of a file, up to `maxSize` bytes. A file with more
 * than that to give is an error, and no more than `maxSize` bytes of it are
 * ever read. Note that assembling the result briefly holds both the chunks
 * read and their concatenation, so peak memory is about twice `maxSize`. See
 * {@link readChunksWithinLimit} for why the size is measured rather than taken
 * on faith.
 *
 * @param path The path to the file to read.
 * @param maxSize The maximum number of bytes to read.
 */
export async function readFile(
  path: string,
  options: { maxSize: number }
): Promise<Result<Buffer, ReadFileError>>;
/**
 * Reads the entire contents of a file, up to `maxSize` bytes. A file with more
 * than that to give is an error, and no more than `maxSize` bytes of it are
 * ever read. Peak memory is about twice `maxSize`, plus the decoded string.
 *
 * @param path The path to the file to read.
 * @param maxSize The maximum number of bytes to read.
 */
export async function readFile(
  path: string,
  options: { maxSize: number; encoding: BufferEncoding }
): Promise<Result<string, ReadFileError>>;
/**
 * Reads the entire contents of a file, up to `maxSize` bytes.
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
  const chunks: Buffer[] = [];

  try {
    for await (const chunk of readChunksWithinLimit(fd, maxSize)) {
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof FileExceedsMaxSizeError) {
      return err({ type: 'FileExceedsMaxSize', maxSize });
    }

    // Nothing else in the loop can throw, so whatever this is came from the
    // file: e.g. EISDIR reading a directory, or EIO from a failing disk.
    assert(error instanceof ReadChunkError);
    return err({ type: 'ReadFileError', error: error.readError });
  } finally {
    // However this ended, the descriptor must not leak.
    await fd.close();
  }

  const buffer = Buffer.concat(chunks);
  return ok(encoding ? buffer.toString(encoding) : buffer);
}
