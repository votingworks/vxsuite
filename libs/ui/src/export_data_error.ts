import { throwIllegalValue } from '@votingworks/basics';
import type { ExportDataError } from '@votingworks/types';

export function userReadableMessageFromExportDataError(
  type: ExportDataError
): string {
  switch (type) {
    case 'file-system-error':
    case 'permission-denied':
      return 'Unable to write to USB drive.';
    case 'missing-usb-drive':
      return 'No USB drive detected.';
    case 'file-too-large':
      return 'File is too large for the USB drive format.';
    case 'insufficient-space':
      return 'Not enough space on the USB drive.';
    case 'relative-file-path':
      return 'Invalid file path.';
    default:
      return throwIllegalValue(type);
  }
}
