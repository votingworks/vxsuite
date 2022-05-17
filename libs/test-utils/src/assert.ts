/**
 * Asserts that {@param condition} is truthy.
 *
 * This is here to avoid depending on `@votingworks/utils` and creating a cycle.
 */
export function assert(
  condition: unknown,
  message?: string
): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}
