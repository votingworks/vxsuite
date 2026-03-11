import { throwIllegalValue } from '@votingworks/basics';
import type { UsbDriveInfo } from '@votingworks/usb-drive';

export type AdminUsbDriveStatus =
  | { status: 'no_drive' }
  | { status: 'mounted'; mountPoint: string; devPath: string }
  | { status: 'ejected' }
  | { status: 'error'; reason: 'bad_format'; devPath: string };

export function getUsbDriveStatus(
  usbDrives: UsbDriveInfo[]
): AdminUsbDriveStatus {
  const drive = usbDrives[0];
  if (!drive) return { status: 'no_drive' };
  const partition = drive.partitions[0];
  if (!partition) return { status: 'no_drive' };
  const { mount, fstype } = partition;
  switch (mount.type) {
    case 'mounted':
      if (fstype && fstype !== 'vfat') {
        return {
          status: 'error',
          reason: 'bad_format',
          devPath: drive.devPath,
        };
      }
      return {
        status: 'mounted',
        mountPoint: mount.mountPoint,
        devPath: drive.devPath,
      };
    case 'unmounted':
    case 'unmounting':
      if (fstype && fstype !== 'vfat') {
        return {
          status: 'error',
          reason: 'bad_format',
          devPath: drive.devPath,
        };
      }
      return { status: 'ejected' };
    case 'mounting':
      return { status: 'no_drive' };
    /* istanbul ignore next */
    default:
      throwIllegalValue(mount, 'type');
  }
}
