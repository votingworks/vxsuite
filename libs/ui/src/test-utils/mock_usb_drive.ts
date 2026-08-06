import { throwIllegalValue } from '@votingworks/basics';

import type {
  UsbDriveStatus,
  UsbPartitionMountpoint,
} from '@votingworks/usb-drive';

export function mockUsbDriveStatus(
  status: UsbDriveStatus['status']
): UsbDriveStatus {
  switch (status) {
    case 'mounted':
      return {
        status,
        mountpoint: '/test-mount-point' as UsbPartitionMountpoint,
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
