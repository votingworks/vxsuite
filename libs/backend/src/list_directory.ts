import { err, ok, Result, assert } from '@votingworks/basics';
import { Dirent, promises as fs } from 'fs';
import { isAbsolute, join } from 'path';
import {
  getUsbDrives as defaultGetUsbDrives,
  UsbDrive,
} from './get_usb_drives';

/**
 * Types of file system entities defined in `libuv`. We omit only `Unknown`,
 * which we handle as an error.
 */
export enum FileSystemEntryType {
  File = 1, // UV_DIRENT_FILE
  Directory = 2, // UV_DIRENT_DIR
  SymbolicLink = 3, // UV_DIRENT_LINK
  FIFO = 4, // UV_DIRENT_FIFO
  Socket = 5, // UV_DIRENT_SOCKET
  CharacterDevice = 6, // UV_DIRENT_CHAR
  BlockDevice = 7, // UV_DIRENT_BLOCK
}

/**
 * Information about a file system entry found in a directory.
 */
export interface FileSystemEntry {
  readonly name: string;
  readonly path: string;
  readonly type: FileSystemEntryType;
  readonly size: number;
  readonly mtime: Date;
  readonly atime: Date;
  readonly ctime: Date;
}

/**
 * Finds the {@link FileSystemEntryType} of a directory entity.
 */
function getDirentType(dirent: Dirent): FileSystemEntryType {
  if (dirent.isFile()) return FileSystemEntryType.File;
  if (dirent.isDirectory()) return FileSystemEntryType.Directory;
  if (dirent.isSymbolicLink()) return FileSystemEntryType.SymbolicLink;
  if (dirent.isFIFO()) return FileSystemEntryType.FIFO;
  if (dirent.isSocket()) return FileSystemEntryType.Socket;
  if (dirent.isCharacterDevice()) return FileSystemEntryType.CharacterDevice;
  if (dirent.isBlockDevice()) return FileSystemEntryType.BlockDevice;
  throw new TypeError('dirent is not of a known type');
}

/**
 * Expected errors that can occur when trying to list directories at an absolute path.
 */
export type ListDirectoryError =
  | { type: 'permission-denied'; message: string }
  | { type: 'no-entity'; message: string }
  | { type: 'not-directory'; message: string };

/**
 * Get entries for a directory, includes stat information for each entry.
 * Requires that the path be absolute.
 */
export async function listDirectory(
  path: string
): Promise<Result<FileSystemEntry[], ListDirectoryError>> {
  assert(isAbsolute(path));

  try {
    const entries = await fs.readdir(path, { withFileTypes: true });
    return ok(
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() || entry.isDirectory())
          .map(async (entry) => {
            const entryPath = join(path, entry.name);
            const stat = await fs.lstat(entryPath);

            return {
              name: entry.name,
              path: entryPath,
              size: stat.size,
              type: getDirentType(entry),
              mtime: stat.mtime,
              atime: stat.atime,
              ctime: stat.ctime,
            };
          })
      )
    );
  } catch (e) {
    const error = e as { code: string };
    switch (error.code) {
      case 'ENOENT':
        return err({
          type: 'no-entity',
          message: `${path} does not exist`,
        });
      case 'ENOTDIR':
        return err({
          type: 'not-directory',
          message: `${path} is not a directory`,
        });
      case 'EACCES':
        return err({
          type: 'permission-denied',
          message: `insufficient permissions to read from ${path}`,
        });
      default:
        throw error;
    }
  }
}

/**
 * Expected errors that can occur when trying to list directories on a USB drive.
 */
export type ListDirectoryOnUsbDriveError =
  | ListDirectoryError
  | { type: 'no-usb-drive' }
  | { type: 'usb-drive-not-mounted' };
/**
 * Lists entities in a directory specified by a relative path within a USB
 * drive's filesystem. Looks at only the first found USB drive.
 */
export async function listDirectoryOnUsbDrive(
  relativePath: string,
  getUsbDrives: () => Promise<UsbDrive[]> = defaultGetUsbDrives
): Promise<Result<FileSystemEntry[], ListDirectoryOnUsbDriveError>> {
  // We currently do not support multiple USB drives
  const [usbDrive] = await getUsbDrives();

  if (!usbDrive) {
    return err({ type: 'no-usb-drive' });
  }

  if (!usbDrive.mountPoint) {
    return err({ type: 'usb-drive-not-mounted' });
  }

  const absolutePath = join(usbDrive.mountPoint, relativePath);
  return await listDirectory(absolutePath);
}
