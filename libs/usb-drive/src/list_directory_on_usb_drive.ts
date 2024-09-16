import { Result, err, throwIllegalValue } from '@votingworks/basics';
import {
  FileSystemEntry,
  ListDirectoryError,
  listDirectory,
} from '@votingworks/fs';
import { join } from 'node:path';
import { UsbDrive } from './types';

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
export async function* listDirectoryOnUsbDrive(
  usbDrive: UsbDrive,
  relativePath: string
): AsyncGenerator<Result<FileSystemEntry, ListDirectoryOnUsbDriveError>> {
  const usbDriveStatus = await usbDrive.status();

  switch (usbDriveStatus.status) {
    case 'no_drive':
      yield err({ type: 'no-usb-drive' });
      break;

    case 'ejected':
    case 'error':
      yield err({ type: 'usb-drive-not-mounted' });
      break;

    case 'mounted':
      yield* listDirectory(join(usbDriveStatus.mountPoint, relativePath));
      break;

    // istanbul ignore next
    default:
      throwIllegalValue(usbDriveStatus);
  }
}
