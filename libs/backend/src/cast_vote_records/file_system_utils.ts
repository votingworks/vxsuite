import fs from 'fs/promises';
import path from 'path';
import { assert } from '@votingworks/basics';
import { execFile } from '../exec';

/**
 * Updates the creation timestamp of a directory and its children files (assuming no
 * sub-directories) using the one method guaranteed to work:
 * ```
 * cp -r <directory-path> <directory-path>-temp
 * rm -r <directory-path>
 * mv <directory-path>-temp <directory-path>
 * ```
 *
 * Doesn't use fs.cp(src, dest, { recursive: true }) under the hood because fs.cp is still
 * experimental.
 */
export async function updateCreationTimestampOfDirectoryAndChildrenFiles(
  directoryPath: string
): Promise<void> {
  await fs.mkdir(`${directoryPath}-temp`);
  const fileNames = (
    await fs.readdir(directoryPath, { withFileTypes: true })
  ).map((entry) => {
    assert(
      entry.isFile(),
      `Unexpected sub-directory ${entry.name} in ${directoryPath}`
    );
    return entry.name;
  });
  for (const fileName of fileNames) {
    // Use execFile instead of fs.copyFile because fs.copyFile has issues in prod when the source
    // and destination paths are both on a USB drive
    await execFile('cp', [
      path.join(directoryPath, fileName),
      path.join(`${directoryPath}-temp`, fileName),
    ]);
  }

  // In case the system loses power while deleting the original directory, mark the copied
  // directory as complete to facilitate recovery on reboot. On reboot, if we see a *-temp
  // directory, we can safely delete it, and if we see a *-temp-complete directory, we can safely
  // delete the original directory and move the *-temp-complete directory to the original path.
  await fs.rename(`${directoryPath}-temp`, `${directoryPath}-temp-complete`);
  await fs.rm(directoryPath, { recursive: true });
  await fs.rename(`${directoryPath}-temp-complete`, directoryPath);
}
