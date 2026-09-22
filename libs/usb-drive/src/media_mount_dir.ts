import { realpathSync } from 'node:fs';

/**
 * Gets the conventional mount root for VotingWorks USB drives. May be a
 * symbolic link in production (e.g., pointing into `/var/vx/usb-drives`).
 */
export function getMediaMountDir(): string {
  return '/media/vx';
}

/**
 * Gets the canonical (symlink-resolved) form of {@link getMediaMountDir}.
 *
 * Falls back to the literal path if `/media/vx` doesn't exist (e.g., dev
 * machines, CI). `/proc/mounts` and `findmnt` report the canonical path the
 * `mount(2)` syscall received, so callers comparing against this value should
 * see consistent results in production.
 */
export function getResolvedMediaMountDir(): string {
  try {
    return realpathSync(getMediaMountDir());
  } catch {
    return getMediaMountDir();
  }
}

/**
 * Gets the glob pattern for files written to real (non-mock) USB drives. Uses
 * the resolved mount root so it matches the canonical paths reported by
 * `/proc/mounts`.
 */
export function getRealUsbDriveGlobPattern(): string {
  return `${getResolvedMediaMountDir()}/**/*`;
}
