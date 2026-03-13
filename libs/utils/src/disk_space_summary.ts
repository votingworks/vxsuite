/**
 * Summary of disk space usage, in kilobytes.
 */
export interface DiskSpaceSummary {
  total: number;
  used: number;
  available: number;
}

export const AVAILABLE_DISK_SPACE_RATIO_WARNING_THRESHOLD = 0.05;
