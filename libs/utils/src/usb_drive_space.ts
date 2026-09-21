/** Total and available space on a mounted USB drive. */
export interface UsbDriveSpace {
  totalBytes: number;
  availableBytes: number;
}

/**
 * Space a file may consume beyond its own size.
 */
const FILESYSTEM_OVERHEAD_BYTES = 1024 * 1024;

export type UsbDriveFileFit =
  'fits' | 'file-too-large' | 'insufficient-space' | 'drive-too-small';

/**
 * Whether a file of `sizeBytes` can be written to a mounted USB drive.
 */
export function checkFileFitsOnUsbDrive(
  drive: Partial<UsbDriveSpace> & { maxFileSize?: number },
  sizeBytes: number
): UsbDriveFileFit {
  if (drive.maxFileSize !== undefined && sizeBytes > drive.maxFileSize) {
    return 'file-too-large';
  }
  const requiredBytes = sizeBytes + FILESYSTEM_OVERHEAD_BYTES;
  if (drive.totalBytes !== undefined && requiredBytes > drive.totalBytes) {
    return 'drive-too-small';
  }
  if (
    drive.availableBytes !== undefined &&
    requiredBytes > drive.availableBytes
  ) {
    return 'insufficient-space';
  }
  return 'fits';
}
