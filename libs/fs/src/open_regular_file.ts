import { Result, err, ok } from '@votingworks/basics';
import { Stats, constants } from 'node:fs';
import { FileHandle } from 'node:fs/promises';
import { open } from './open_file';

/**
 * Why {@link openRegularFileForReading} or {@link openRegularFileForWriting}
 * would not hand back a file.
 */
export type OpenRegularFileError =
  | { type: 'OpenFileError'; error: Error }
  | { type: 'NotRegularFile' };

/**
 * Opens a path, refusing anything that is not a regular file.
 *
 * A path says nothing about what sits at the end of it, and on removable media
 * what sits there is chosen by whoever handed us the drive. Two things follow,
 * and this handles both:
 *
 * - `O_NONBLOCK`, because opening a FIFO blocks until something is attached to
 *   the other end — forever, if nothing ever is. It blocks inside the syscall,
 *   so no abort signal or timeout in the caller can reach it, and it holds a
 *   libuv threadpool thread while it waits; four of them and the process does
 *   no filesystem work at all. The flag makes the open return either way, and
 *   has no effect on a regular file, which is the only kind that gets past the
 *   check below.
 * - An `fstat` of the descriptor we actually opened, rather than a `stat` of
 *   the path we asked for, so nothing can be swapped in between the two.
 *   Checking the opened descriptor is also what makes a symlink harmless
 *   without refusing symlinks: whatever it pointed at is what got opened, and
 *   that is what gets checked.
 */
async function openRegularFile(
  path: string,
  flags: number
): Promise<Result<FileHandle, OpenRegularFileError>> {
  const openResult = await open(path, flags);
  if (openResult.isErr()) {
    return err({ type: 'OpenFileError', error: openResult.err() });
  }

  const file = openResult.ok();
  let stats: Stats;
  try {
    stats = await file.stat();
  } catch (error) {
    await file.close();
    return err({ type: 'OpenFileError', error: error as Error });
  }

  if (!stats.isFile()) {
    await file.close();
    return err({ type: 'NotRegularFile' });
  }

  return ok(file);
}

/**
 * Opens a regular file for reading. See {@link openRegularFile}.
 */
export function openRegularFileForReading(
  path: string
): Promise<Result<FileHandle, OpenRegularFileError>> {
  // eslint-disable-next-line no-bitwise
  return openRegularFile(path, constants.O_RDONLY | constants.O_NONBLOCK);
}

/**
 * Opens a regular file for writing, creating it if it isn't there and
 * truncating it if it is. See {@link openRegularFile}.
 *
 * The check earns its keep on the path that was already taken: `O_CREAT` opens
 * whatever is there rather than creating anything, so a device node left at a
 * destination would otherwise be written to as if it were the file.
 */
export function openRegularFileForWriting(
  path: string
): Promise<Result<FileHandle, OpenRegularFileError>> {
  return openRegularFile(
    path,
    // eslint-disable-next-line no-bitwise
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NONBLOCK
  );
}
