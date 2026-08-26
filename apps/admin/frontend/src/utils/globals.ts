export const DEFAULT_QUERY_REFETCH_INTERVAL = 1000;

/**
 * Counting imported CVRs scans every cast vote record row, so the Scanners
 * tab polls it much less often than the default interval.
 */
export const SCANNER_IMPORT_COUNTS_REFETCH_INTERVAL = 5000;
