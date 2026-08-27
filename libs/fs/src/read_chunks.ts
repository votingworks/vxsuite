import { Buffer } from 'node:buffer';
import { FileHandle } from 'node:fs/promises';
import { FileExceedsMaxSizeError } from './file_exceeds_max_size_error';
import { ReadChunkError } from './read_chunk_error';

/**
 * How much is read at a time from a file whose size we do not trust in advance.
 *
 * Large enough that per-read overhead is not what dominates — at 64 KB it was,
 * costing roughly a third of a copy's time and several times a read's — and
 * small enough that a limit is overshot by at most this much before it is
 * noticed. Note that this is what an untrusted file may briefly cost us beyond
 * `maxSize`; nothing beyond the limit is ever written or kept.
 */
export const READ_CHUNK_SIZE = 1024 * 1024;

/**
 * Reads a file in chunks, stopping as soon as it has produced more than
 * `maxSize` bytes in total.
 *
 * The size is counted as the bytes arrive rather than read from a `stat`
 * beforehand. A file may live on removable media, where what it says about
 * itself is a claim and not a fact, and where it can change between being
 * measured and being read: trusting the claim risks both consuming more than
 * `maxSize` and silently taking a prefix of a file that grew. Counting what
 * actually arrives is what makes `maxSize` a limit on what a caller spends.
 *
 * Opening and closing `fd` is the caller's business, since what to do about a
 * partial read differs depending on where those bytes were going. Failures are
 * thrown rather than returned so that a caller consuming the chunks can tell
 * them apart from its own; see {@link ReadChunkError}.
 *
 * Each chunk is freshly allocated, so a caller may keep the ones it is given.
 * Pass `reuseBuffer: true` if every chunk is finished with before the next is
 * asked for — copying it somewhere, hashing it — to read the whole file through
 * a single buffer instead of allocating one per chunk. A retained chunk will
 * then be overwritten in place, so this has to be opted into.
 */
export async function* readChunksWithinLimit(
  fd: FileHandle,
  maxSize: number,
  { reuseBuffer = false }: { reuseBuffer?: boolean } = {}
): AsyncGenerator<Buffer> {
  const reusedBuffer = reuseBuffer
    ? Buffer.allocUnsafe(READ_CHUNK_SIZE)
    : undefined;
  let size = 0;

  for (;;) {
    const chunk = reusedBuffer ?? Buffer.allocUnsafe(READ_CHUNK_SIZE);
    let bytesRead: number;

    try {
      ({ bytesRead } = await fd.read(chunk, 0, READ_CHUNK_SIZE, null));
    } catch (error) {
      throw new ReadChunkError(error as globalThis.Error);
    }

    if (bytesRead === 0) return;

    size += bytesRead;
    if (size > maxSize) {
      throw new FileExceedsMaxSizeError(maxSize);
    }

    yield chunk.subarray(0, bytesRead);
  }
}
