import { realpathSync } from 'node:fs';

/**
 * The conventional mount root for VotingWorks USB drives. May be a symbolic
 * link in production (e.g., pointing into `/var/vx/usb-drives`).
 */
export const MEDIA_MOUNT_DIR: string = '/media/vx';

/**
 * The canonical (symlink-resolved) form of {@link MEDIA_MOUNT_DIR}. Resolved
 * once at module load — the mount root doesn't change at runtime, and several
 * call sites (shell scripts, export-path glob patterns, mountpoint filtering)
 * need a consistent value.
 *
 * Falls back to the literal path if `/media/vx` doesn't exist (e.g., dev
 * machines, CI). `/proc/mounts` and `findmnt` report the canonical path the
 * `mount(2)` syscall received, so callers comparing against this value should
 * see consistent results in production.
 */
export const RESOLVED_MEDIA_MOUNT_DIR: string = (() => {
  try {
    return realpathSync(MEDIA_MOUNT_DIR);
  } catch {
    return MEDIA_MOUNT_DIR;
  }
})();

/**
 * Glob pattern for files written to real (non-mock) USB drives. Uses the
 * resolved mount root so it matches the canonical paths reported by
 * `/proc/mounts`.
 */
export const REAL_USB_DRIVE_GLOB_PATTERN = `${RESOLVED_MEDIA_MOUNT_DIR}/**/*`;
