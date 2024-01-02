// 03-filter.ts
//
// Task: Complete the `filterNullish` function using `iter` to filter nullish
// values from the provided iterable into an array.
//
//   For example, if the iterable is `[1, 2, null, 3, undefined, 4]`, the result
//   should be `[1, 2, 3, 4]`.
//
// Hint: what does `iter` return? What methods does it have?

import { iter } from '@votingworks/basics';
import { TODO } from '../src/todo';
import { run } from '../src/example';
import { collecting } from '../src/collecting';

function filterNullish<T>(iterable: Iterable<T>): Iterable<NonNullable<T>> {
  TODO();
}

function filterNullishReference<T>(
  iterable: Iterable<T>
): Array<NonNullable<T>> {
  const values: Array<NonNullable<T>> = [];

  for (const value of iterable) {
    if (value != null) {
      values.push(value);
    }
  }

  return values;
}

run({
  makeInput: () => [1, 2, null, 3, undefined, 4],
  referenceImplementation: filterNullishReference,
  exerciseImplementation: filterNullish,
  solutionImplementation: collecting(filterNullishSolution),
});

// Scroll down for solutions. ↓
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
// Solutions ↓

function filterNullishSolution<T>(
  iterable: Iterable<T>
): Array<NonNullable<T>> {
  return iter(iterable)
    .filter((value): value is NonNullable<T> => value != null)
    .toArray();
}
