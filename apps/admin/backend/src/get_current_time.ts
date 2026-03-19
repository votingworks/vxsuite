/**
 * Returns the current time as a Unix timestamp in milliseconds.
 *
 * Separated into its own file so that it can be mocked in tests.
 */
export function getCurrentTime(): number {
  return Math.floor(Date.now());
}
