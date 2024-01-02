// 04-take.ts
//
// Task: Complete the `takeFirst10` function using `iter` to take the first 10
// values from the provided iterable into an array.
//
// Hint: `fibonacci` is an infinite iterable. What happens if you try to make an
// array from it and then slice the first ten elements?

import { iter } from '@votingworks/basics';
import { TODO } from '../src/todo';
import { run } from '../src/example';

function takeFirst10<T>(iterable: Iterable<T>): T[] {
  TODO();
}

function takeFirst10Reference<T>(iterable: Iterable<T>): T[] {
  const values: T[] = [];

  for (const value of iterable) {
    if (values.length >= 10) {
      break;
    }

    values.push(value);
  }

  return values;
}

run({
  makeInput: fibonacci,
  referenceImplementation: takeFirst10Reference,
  exerciseImplementation: takeFirst10,
  solutionImplementation: takeFirst10Solution,
});

function* fibonacci(): IterableIterator<number> {
  let a = 0;
  let b = 1;

  for (;;) {
    yield a;
    [a, b] = [b, a + b];
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

function takeFirst10Solution<T>(iterable: Iterable<T>): T[] {
  return iter(iterable).take(10).toArray();
}
