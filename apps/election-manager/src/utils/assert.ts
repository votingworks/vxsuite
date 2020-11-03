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

/**
 * Asserts that `value` is defined, i.e. not null or undefined. It also helps
 * TypeScript refine the type.
 */
export function defined<T>(value: T | undefined | null): T {
  // eslint-disable-next-line no-restricted-syntax
  assert(typeof value !== 'undefined' && value !== null)
  return value
}
