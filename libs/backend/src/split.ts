import { assert } from '@votingworks/basics';
import { createWriteStream, renameSync } from 'node:fs';
import { join, parse } from 'node:path';
import StreamChopper from 'stream-chopper';
import { pipeline } from 'node:stream/promises';

/**
 * Options for {@link split}.
 */
export interface SplitOptions {
  /**
   * Number of bytes (for Buffer) or characters (for string) to write to each stream.
   */
  size: number;

  /**
   * Gets the next stream to write to.
   *
   * @param index - the number of the stream, i.e. how many have come before
   */
  nextOutput(index: number): NodeJS.WritableStream;
}

/**
 * Reads a stream and splits it into multiple streams, changing from one to the next
 * once the current stream reaches the specified size. Resolves once all data has
 * been written and the last stream is finished.
 *
 * @example
 *
 * ```ts
 * await split(process.stdin, {
 *   size: 100 * 1024 * 1024, // 100MB
 *   nextOutput: (index) => {
 *     console.log(`starting stream ${index}`);
 *     return process.stdout;
 *   },
 * });
 * ```
 */
export async function split(
  input: NodeJS.ReadableStream,
  options: SplitOptions
): Promise<void> {
  // `split` is a thin wrapper around `stream-chopper`. That library creates a
  // new writable stream and yields readable streams split by size or time. In
  // contrast, `split` takes a readable stream and asks for a series of writable
  // streams to write the original stream data to.

  let streamIndex = 0;
  const chopper = new StreamChopper({
    size: options.size,
    type: StreamChopper.split,
  });

  const finishPromises: Array<Promise<void>> = [];
  chopper.on('stream', async (stream, next) => {
    try {
      const nextOutput = options.nextOutput(streamIndex);
      streamIndex += 1;
      const finishPromise = new Promise<void>((resolve) => {
        nextOutput.on('finish', resolve);
      });
      finishPromises.push(finishPromise);
      await pipeline(stream, nextOutput);
      next();
    } catch (error) {
      next(error);
    }
  });

  await pipeline(input, chopper);

  // ensure all streams are finished before returning
  await Promise.all(finishPromises);
}

/**
 * Options for {@link splitToFiles}.
 */
export interface SplitToFilesOptions {
  /**
   * Number of bytes (for Buffer) or characters (for string) to write to each file.
   */
  size: number;

  /**
   * Gets the path for the next file to write data to.
   */
  nextPath(index: number): string;

  /**
   * Optional filename for when there is a single file to write to. Note that
   * the data will still be written to a temporary file and then renamed to this
   * path.
   */
  singleFileName?: string;
}

/**
 * Splits a stream into multiple files, changing from one to the next once the
 * current file reaches the specified size. If `singleFileName` is specified and
 * only a single file is written, the file will be renamed to that value.
 *
 * Note that if the stream is empty then no files will be written.
 *
 * @returns the paths of the files written to
 *
 * @example
 *
 * ```ts
 * // splits a file from a stream into multiple files, each with a maximum size of 1MB
 * // i.e. large-file.zip-part-00, large-file.zip-part-01, large-file.zip-part-02, etc.
 * await splitToFiles(fs.createReadStream('large-file.zip'), {
 *  size: 1024 * 1024, // 1MB per file
 *  nextPath: (index) => `large-file.zip-part-${index.toString().padStart(2, '0')}`),
 * });
 *
 * // writes data from a stream to a single file if it fits, or splits it into multiple
 * await splitToFiles(stream, {
 *   size: 1024 * 1024, // 1MB per file
 *   nextPath: (index) => `large-file.zip-part-${index.toString().padStart(2, '0')}`,
 *   singleFileName: 'large-file.zip',
 * });
 * ```
 */
export async function splitToFiles(
  input: NodeJS.ReadableStream,
  options: SplitToFilesOptions
): Promise<string[]> {
  assert(options.size > 0, 'size must be greater than 0');

  if (options.singleFileName) {
    const { dir } = parse(options.singleFileName);
    assert(!dir, 'singleFileName must not include a directory');
  }

  const paths: string[] = [];

  await split(input, {
    ...options,
    nextOutput(index) {
      const path = options.nextPath(index);
      paths.push(path);
      return createWriteStream(path);
    },
  });

  if (options.singleFileName && paths.length === 1) {
    const path = paths[0] as string;
    const { dir } = parse(path);
    const singleFilePath = join(dir, options.singleFileName);
    renameSync(path, singleFilePath);
    paths[0] = singleFilePath;
  }

  return paths;
}
