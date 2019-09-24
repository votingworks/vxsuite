/**
 * Returns number param as ordinal.
 * Source: https://stackoverflow.com/a/31615643/101290
 *
 * @example
 *
 *   ordinal(1)  // '1st'
 *   ordinal(42) // '42nd'
 *   ordinal(99) // '99th'
 *
 */

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
export default ordinal
