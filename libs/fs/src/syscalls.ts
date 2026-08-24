import {
  assertDefined,
  err,
  extractErrorMessage,
  ok,
  Result,
} from '@votingworks/basics';
import { open } from './open_file';
import { napi } from './napi';

/**
 * A failed syscall: the errno name (e.g. `ENOENT`, `EEXIST`, `EINVAL`) and
 * the full error message.
 */
export interface SyscallError {
  code: string;
  message: string;
}

// Both the native addon and Node's own filesystem errors put the errno name
// before the first colon, e.g. `ENOENT: No such file or directory`.
function syscallError(error: unknown): SyscallError {
  const message = extractErrorMessage(error);
  return { code: assertDefined(message.split(':')[0]), message };
}

/**
 * Atomically exchanges two paths, using `renameat2(2)` with `RENAME_EXCHANGE`:
 * afterwards each path names what the other named before, and at no point
 * does either name not exist. The paths may be files or directories, in any
 * combination. Both must exist on the same filesystem, and the filesystem
 * must support the operation (ext4, xfs, btrfs, and tmpfs do; FAT32 does not,
 * failing with `EINVAL`).
 *
 * Note the usual rename caveat: atomicity says nothing about durability.
 * Flush (fsync the parent directory, or syncfs) if the exchange must survive
 * losing power.
 */
export function exchangePaths(
  pathA: string,
  pathB: string
): Result<void, SyscallError> {
  try {
    napi.renameExchange(pathA, pathB);
    return ok();
  } catch (error) {
    return err(syscallError(error));
  }
}

/**
 * Renames `oldPath` to `newPath`, using `renameat2(2)` with
 * `RENAME_NOREPLACE`: where a plain `rename(2)` would atomically replace an
 * existing `newPath`, this fails with `EEXIST` and changes nothing. Same
 * filesystem-support caveats as {@link exchangePaths}.
 */
export function renameNoReplace(
  oldPath: string,
  newPath: string
): Result<void, SyscallError> {
  try {
    napi.renameNoReplace(oldPath, newPath);
    return ok();
  } catch (error) {
    return err(syscallError(error));
  }
}

/**
 * Asks the kernel to drop the cached pages for a file, using
 * `posix_fadvise(2)` with `POSIX_FADV_DONTNEED`, so that the next read of it
 * is served from the device rather than from RAM. Dirty pages are not
 * dropped, so flush first (fsync or syncfs) — then a read-after-drop proves
 * what the device actually stored, which is the point of calling this.
 *
 * Advisory, as the name says: the kernel may keep pages that are still in
 * use elsewhere. `ok()` means the advice was accepted, not that every page
 * is gone.
 */
export async function dropPageCache(
  path: string
): Promise<Result<void, SyscallError>> {
  const openResult = await open(path);
  if (openResult.isErr()) {
    return err(syscallError(openResult.err()));
  }
  const file = openResult.ok();
  try {
    napi.fadviseDontNeed(file.fd);
    return ok();
  } catch (error) {
    return err(syscallError(error));
  } finally {
    await file.close();
  }
}

/**
 * Flushes the filesystem containing `path`, using `syncfs(2)`: every dirty
 * page and metadata change on that filesystem is written to the device before
 * this resolves. One flush covers the whole filesystem, so this is far cheaper
 * than fsyncing each file when many files have just been written.
 *
 * This is the durability half of {@link exchangePaths} and of writing files at
 * all: without it, data and renames live in the page cache and are lost if the
 * device is removed or power is cut. Note it flushes the entire filesystem,
 * including writes made by other processes.
 *
 * An `EIO` here means the device rejected the data, i.e. what was written is
 * not what will be read back.
 */
export async function syncFilesystem(
  path: string
): Promise<Result<void, SyscallError>> {
  const openResult = await open(path);
  if (openResult.isErr()) {
    return err(syscallError(openResult.err()));
  }
  const file = openResult.ok();
  try {
    napi.syncfs(file.fd);
    return ok();
  } catch (error) {
    return err(syscallError(error));
  } finally {
    await file.close();
  }
}

/**
 * A held exclusive file lock. The kernel releases it when the descriptor
 * closes, so dropping this on the floor — or dying — releases the lock; the
 * only reason to release it explicitly is to do so before the process exits.
 */
export interface FileLock extends AsyncDisposable {
  release: () => Promise<void>;
}

/**
 * Whether a failed {@link tryLockFileExclusive} failed because someone else
 * holds the lock, as opposed to something being wrong.
 */
export function isLockHeldElsewhereError(error: SyscallError): boolean {
  // `flock(2)` reports this as EWOULDBLOCK, which is EAGAIN on Linux.
  return error.code === 'EAGAIN' || error.code === 'EWOULDBLOCK';
}

/**
 * Takes an exclusive lock on `path`, creating the file if it isn't there, and
 * returns without waiting if someone else holds it — see
 * {@link isLockHeldElsewhereError} to tell that case from a real failure.
 *
 * Unlike a lock file whose existence is the lock, this cannot be stranded: the
 * lock lives on the open descriptor, so the kernel drops it if the holder is
 * killed or the machine restarts. For the same reason the file is left in
 * place when the lock is released, rather than unlinked — deleting it would
 * let a waiter lock a path the next arrival no longer shares.
 */
export async function tryLockFileExclusive(
  path: string
): Promise<Result<FileLock, SyscallError>> {
  const openResult = await open(path, 'a');
  if (openResult.isErr()) {
    return err(syscallError(openResult.err()));
  }
  const file = openResult.ok();

  try {
    napi.flockExclusiveNonblocking(file.fd);
  } catch (error) {
    await file.close();
    return err(syscallError(error));
  }

  let released = false;
  async function release(): Promise<void> {
    if (!released) {
      released = true;
      await file.close();
    }
  }

  return ok({ release, [Symbol.asyncDispose]: release });
}
