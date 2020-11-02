/**
 * Asserts for both runtime and type-check purposes that `condition` is true.
 *
 * @example
 *
 * function len(array: unknown): number {
 *   assert(Array.isArray(array))
 *   return array.length
 * }
 */
export default function assert(
  condition: boolean,
  message = 'assertion failed'
): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}
