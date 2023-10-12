import { throwIllegalValue } from '@votingworks/basics';

import type { UsbDriveStatus } from '@votingworks/usb-drive';

export function mockUsbDriveStatus(
  status: UsbDriveStatus['status'],
  options: { doesUsbDriveRequireCastVoteRecordSync?: true } = {}
): UsbDriveStatus & { doesUsbDriveRequireCastVoteRecordSync?: true } {
  switch (status) {
    case 'mounted':
      return {
        status,
        mountPoint: 'test-mount-point',
        doesUsbDriveRequireCastVoteRecordSync:
          options.doesUsbDriveRequireCastVoteRecordSync,
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
