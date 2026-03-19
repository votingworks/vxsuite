import * as format from './format.js';

/**
 * Summary of disk space usage, in kilobytes.
 */
export interface DiskSpaceSummary {
  total: number;
  used: number;
  available: number;
}

export const AVAILABLE_DISK_SPACE_RATIO_WARNING_THRESHOLD = 0.05;

/**
 * Returns a warning message string if disk space is low, or `undefined` if disk
 * space is sufficient.
 */
export function getLowDiskSpaceWarningMessage(
  diskSpaceSummary: DiskSpaceSummary
): string | undefined {
  const availableDiskSpaceRatio =
    diskSpaceSummary.available / diskSpaceSummary.total;
  if (availableDiskSpaceRatio > AVAILABLE_DISK_SPACE_RATIO_WARNING_THRESHOLD) {
    return undefined;
  }
  const availableDiskSpaceBytes = Math.round(diskSpaceSummary.available * 1024);
  const totalDiskSpaceBytes = Math.round(diskSpaceSummary.total * 1024);
  return `Free disk space is down to ${format.percent(
    availableDiskSpaceRatio
  )} (${format.bytes(availableDiskSpaceBytes)} of ${format.bytes(
    totalDiskSpaceBytes
  )}).`;
}
