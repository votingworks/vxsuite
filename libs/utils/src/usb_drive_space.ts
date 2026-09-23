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
  | { type: 'fits' }
  | { type: 'file-too-large'; maxFileSize: number }
  | { type: 'insufficient-space'; availableBytes: number }
  | { type: 'drive-too-small'; totalBytes: number };

/**
 * Whether a file of `sizeBytes` can be written to a mounted USB drive.
 */
export function checkFileFitsOnUsbDrive(
  drive: Partial<UsbDriveSpace> & { maxFileSize?: number },
  sizeBytes: number
): UsbDriveFileFit {
  const { maxFileSize, totalBytes, availableBytes } = drive;
  const requiredBytes = sizeBytes + FILESYSTEM_OVERHEAD_BYTES;
  if (totalBytes !== undefined && requiredBytes > totalBytes) {
    return { type: 'drive-too-small', totalBytes };
  }
  if (maxFileSize !== undefined && sizeBytes > maxFileSize) {
    return { type: 'file-too-large', maxFileSize };
  }
  if (availableBytes !== undefined && requiredBytes > availableBytes) {
    return { type: 'insufficient-space', availableBytes };
  }
  return { type: 'fits' };
}
