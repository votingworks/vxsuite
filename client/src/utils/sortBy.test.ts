import sortBy from './sortBy'

test('returns a copy with the same order given no comparators', () => {
  expect(sortBy([1, 2, 3])).toEqual([1, 2, 3])
})

test('returns a sorted copy based on a single comparator', () => {
  expect(sortBy([1, 2, 3, 4, 5], (a, b) => b - a)).toEqual([5, 4, 3, 2, 1])
})

test('sorts by the comparators in the order given', () => {
  expect(
    sortBy(
      [1, 2, 3, 4, 5],
      // sort odd numbers ahead of even numbers
      (a, b) => (a % 2 === b % 2 ? 0 : a % 2 === 1 ? -1 : 1),
      // reversed within odd/even
      (a, b) => b - a
    )
  ).toEqual([5, 3, 1, 4, 2])
})

test('falls back to preserving order if no comparator specifies', () => {
  expect(
    sortBy(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 0],
      // sort 3 first
      (a, b) => (a === 3 ? -1 : b === 3 ? 1 : 0),
      // sort 1 last
      (a, b) => (a === 1 ? 1 : b === 1 ? -1 : 0)
      // everything else stays where it is by default
      // as if this last comparator were given:
      // () => 0
    )
  ).toEqual([3, 2, 4, 5, 6, 7, 8, 9, 0, 1])
})
