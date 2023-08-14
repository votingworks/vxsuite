/**
 * Returns an array of numbers from start (inclusive) to end (exclusive).
 *
 * Example: range(0, 3) -> [0, 1, 2]
 */
export function range(start: number, end: number): number[] {
  if (end < start) {
    throw new Error(
      `end (${end}) must be greater than or equal to start (${start})`
    );
  }
  return Array.from({ length: end - start }, (_, i) => i + start);
}
