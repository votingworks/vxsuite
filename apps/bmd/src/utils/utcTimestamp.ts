/**
 * Returns current UTC unix timestamp (epoch) in seconds
 */

function utcTimestamp(): number {
  return Math.round(Date.now() / 1000);
}
export default utcTimestamp;
