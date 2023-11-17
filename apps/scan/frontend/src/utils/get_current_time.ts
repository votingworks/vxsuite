/**
 * Simply a wrapper for `Date.now()`, returns the current time in Unix time.
 *
 * Separated out into its own file so that it can be mocked in tests.
 */
export function getCurrentTime(): number {
  return Date.now();
}
