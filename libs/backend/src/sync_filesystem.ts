import { execFile } from './exec';

/**
 * Flushes everything written to the filesystem containing `path` out to its
 * device, so that a drive unplugged immediately afterward still holds it.
 *
 * Closing a file only hands its data to the page cache. On a removable drive
 * that can leave nothing on the device for many seconds, which is how exports
 * used to go missing when a person pulled the drive as soon as the screen said
 * the write was done.
 *
 * This shells out because it needs `syncfs(2)`, which Node does not expose:
 * `fsync` would cover only the files we remember to name, and mounting the
 * drive with `-o sync` costs roughly 9x the write time.
 */
export async function syncFilesystem(path: string): Promise<void> {
  await execFile('sync', ['-f', path]);
}
