import { Result, err, ok } from '@votingworks/basics';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { open } from './open_file';
import { FileExceedsMaxSizeError } from './file_exceeds_max_size_error';
import { ReadChunkError } from './read_chunk_error';
import { readChunksWithinLimit } from './read_chunks';

/**
 * Possible errors that can occur when copying a file.
 */
export type CopyFileError =
  | { type: 'OpenFileError'; error: globalThis.Error }
  | { type: 'FileExceedsMaxSize'; maxSize: number }
  | { type: 'ReadFileError'; error: globalThis.Error }
  | { type: 'WriteFileError'; error: globalThis.Error };

/**
 * What a copied file turned out to hold, measured as it was copied rather than
 * taken on faith beforehand.
 */
export interface CopiedFile {
  size: number;
}

/**
 * A {@link CopiedFile} whose contents were also digested along the way.
 */
export interface DigestedCopiedFile extends CopiedFile {
  sha256: string;
}

/**
 * Copies a file, up to `maxSize` bytes. A file with more than that to give is
 * an error, and no more than `maxSize` bytes of it are ever written.
 *
 * As with {@link readFile}, the size is counted as the bytes arrive rather than
 * read from a `stat` beforehand: a source may live on removable media, so what
 * it says about its own size is a claim and not a fact. Counting what actually
 * arrives is what makes `maxSize` a limit on what a caller spends, rather than
 * a limit on what the source admits to.
 *
 * Pass `digest: 'sha256'` to hash the contents during the copy, which callers
 * who have to verify what they copied need anyway and which costs no extra
 * read. A partial copy is removed rather than left for a caller to trip over.
 *
 * Pass `onProgress` to hear how many bytes have landed in the destination so
 * far, called once per chunk written.
 */
export async function copyFile(options: {
  source: string;
  destination: string;
  maxSize: number;
  onProgress?: (copiedBytes: number) => void;
}): Promise<Result<CopiedFile, CopyFileError>>;
/**
 * Copies a file, up to `maxSize` bytes, hashing its contents along the way.
 */
export async function copyFile(options: {
  source: string;
  destination: string;
  maxSize: number;
  digest: 'sha256';
  onProgress?: (copiedBytes: number) => void;
}): Promise<Result<DigestedCopiedFile, CopyFileError>>;
/**
 * Copies a file, up to `maxSize` bytes.
 */
export async function copyFile({
  source,
  destination,
  maxSize,
  digest,
  onProgress,
}: {
  source: string;
  destination: string;
  maxSize: number;
  digest?: 'sha256';
  onProgress?: (copiedBytes: number) => void;
}): Promise<Result<CopiedFile | DigestedCopiedFile, CopyFileError>> {
  if (maxSize < 0) {
    throw new Error('maxSize must be non-negative');
  }

  const openSourceResult = await open(source);
  if (openSourceResult.isErr()) {
    return err({ type: 'OpenFileError', error: openSourceResult.err() });
  }

  const sourceFd = openSourceResult.ok();
  try {
    const openDestinationResult = await open(destination, 'w');
    if (openDestinationResult.isErr()) {
      return err({
        type: 'WriteFileError',
        error: openDestinationResult.err(),
      });
    }

    const destinationFd = openDestinationResult.ok();
    const hash = digest ? createHash(digest) : undefined;
    let size = 0;
    let succeeded = false;

    try {
      // Every chunk is hashed and written before the next is asked for, so
      // they can all share one buffer.
      for await (const chunk of readChunksWithinLimit(sourceFd, maxSize, {
        reuseBuffer: true,
      })) {
        size += chunk.byteLength;
        hash?.update(chunk);

        // `write` may accept fewer bytes than offered without erroring, so
        // keep writing until the whole chunk has landed.
        let written = 0;
        while (written < chunk.byteLength) {
          const { bytesWritten } = await destinationFd.write(
            chunk,
            written,
            chunk.byteLength - written
          );
          written += bytesWritten;
        }

        onProgress?.(size);
      }

      succeeded = true;
    } catch (error) {
      // Anything the chunks themselves raise is about the source; anything
      // raised in the loop body is this function writing.
      if (error instanceof FileExceedsMaxSizeError) {
        return err({ type: 'FileExceedsMaxSize', maxSize });
      }

      if (error instanceof ReadChunkError) {
        return err({ type: 'ReadFileError', error: error.readError });
      }

      return err({ type: 'WriteFileError', error: error as Error });
    } finally {
      const shouldRemove = !succeeded && (await destinationFd.stat()).isFile();
      await destinationFd.close();

      if (shouldRemove) {
        await rm(destination, { force: true });
      }
    }

    return ok(hash ? { size, sha256: hash.digest('hex') } : { size });
  } finally {
    await sourceFd.close();
  }
}
