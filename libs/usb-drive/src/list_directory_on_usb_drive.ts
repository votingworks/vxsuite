import { Result } from '@votingworks/basics';
import {
  FileSystemEntry,
  ListDirectoryError,
  ListDirectoryOptions,
  listDirectory,
} from '@votingworks/fs';
import { join } from 'node:path';
import { MountedUsbDrive } from './types';

/**
 * Expected errors that can occur when trying to list directories on a USB drive.
 */
export type ListDirectoryOnUsbDriveError = ListDirectoryError;

/**
 * Lists entities in a directory specified by a relative path within a USB
 * drive's filesystem. Looks at only the first found USB drive.
 */
export async function* listDirectoryOnUsbDrive(
  mountedUsbDrive: MountedUsbDrive,
  relativePath: string,
  options: ListDirectoryOptions = {}
): AsyncGenerator<Result<FileSystemEntry, ListDirectoryOnUsbDriveError>> {
  yield* listDirectory(join(mountedUsbDrive.mountPoint, relativePath), options);
}
