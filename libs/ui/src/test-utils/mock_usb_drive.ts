import { throwIllegalValue } from '@votingworks/basics';

import type {
  MountedUsbDriveStatus,
  UsbDriveStatus,
  UsbPartitionMountpoint,
} from '@votingworks/usb-drive';

export function mockUsbDriveStatus(
  status: UsbDriveStatus['status'],
  mounted: Partial<Omit<MountedUsbDriveStatus, 'status'>> = {}
): UsbDriveStatus {
  switch (status) {
    case 'mounted':
      return {
        status,
        mountpoint: '/test-mount-point' as UsbPartitionMountpoint,
        fstype: 'fat32',
        ...mounted,
      };
    case 'no_drive':
    case 'ejected':
      return { status };
    case 'error':
      return {
        status,
        reason: 'bad_format',
      };
    default:
      throwIllegalValue(status);
  }
}
