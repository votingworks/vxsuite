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
  const { mount, fstype, fsver } = partition;
  function isBadFormat(): boolean {
    return !!fstype && !(fstype === 'vfat' && fsver === 'FAT32');
  }
  switch (mount.type) {
    case 'mounted':
      if (isBadFormat()) {
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
    case 'unmounting':
      return { status: 'ejected' };
    case 'unmounted':
      if (isBadFormat()) {
        return {
          status: 'error',
          reason: 'bad_format',
          devPath: drive.devPath,
        };
      }
      return { status: 'no_drive' };
    case 'mounting':
      return { status: 'no_drive' };
    /* istanbul ignore next */
    default:
      throwIllegalValue(mount, 'type');
  }
}
