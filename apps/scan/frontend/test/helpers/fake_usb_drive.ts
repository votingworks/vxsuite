import { throwIllegalValue } from '@votingworks/basics';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { UsbDriveStatus } from '@votingworks/usb-drive';

export function fakeUsbDriveStatus(
  status: UsbDriveStatus['status']
): UsbDriveStatus {
  switch (status) {
    case 'mounted':
      return {
        status,
        mountPoint: 'test-mount-point',
        deviceName: 'test-device-name',
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
