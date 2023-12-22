// 01-toArray.ts
//
// Task: Complete the `collect` function to use `iter` to collect the values
// from the provided iterable into an array.
//
// Hint: look at the function signature for `iter` in @votingworks/basics.

import { iter } from '@votingworks/basics';
import { run } from '../src/example';
import { TODO } from '../src/todo';

function collect<T>(iterable: Iterable<T>): T[] {
  TODO();
}

function collectReference<T>(iterable: Iterable<T>): T[] {
  const values: T[] = [];

  for (const value of iterable) {
    values.push(value);
  }

  return values;
}

run({
  makeInput: oneToTen,
  referenceImplementation: collectReference,
  exerciseImplementation: collect,
  solutionImplementation: collectSolution,
});

function* oneToTen(): Generator<number> {
  for (let i = 1; i <= 10; i += 1) {
    yield i;
  }
}

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

// Use `iter` and the `toArray` method to collect the values. This is one of
// several methods that consume the remaining values in an iterator.
function collectSolution<T>(iterable: Iterable<T>): T[] {
  return iter(iterable).toArray();
}
