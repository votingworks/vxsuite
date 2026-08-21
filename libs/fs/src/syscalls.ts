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
