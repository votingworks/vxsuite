/**
 * Returns number param as ordinal.
 * Source: https://stackoverflow.com/a/31615643/101290
 *
 * @param n number
 *
 * @return ordinal string
 *
 */

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
export default ordinal
