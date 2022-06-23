/**
 * Returns current UTC unix timestamp (epoch) in seconds
 */

export function utcTimestamp(): number {
  return Math.round(Date.now() / 1000);
}
