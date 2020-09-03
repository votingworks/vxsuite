export type Comparator<T> = Exclude<Parameters<T[]['sort']>[0], undefined>

/**
 * Sort an array by comparators in priority order.
 *
 * @returns a sorted copy of the original array
 */
export default function sortBy<T>(
  array: readonly T[],
  ...comparators: Comparator<T>[]
): T[] {
  if (comparators.length === 0) {
    return [...array]
  }

  return [...array].sort((a, b) => {
    for (const comparator of comparators) {
      const result = comparator(a, b)
      if (result !== 0) {
        return result
      }
    }
    return 0
  })
}
