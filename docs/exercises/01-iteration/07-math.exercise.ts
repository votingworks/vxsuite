// 07-math.ts
//
// Task: Complete the `computeMin`, `computeMax`, and `computeAverage` functions
// using `iter` to compute the minimum, maximum, and average of the provided
// array.
//
//   For example, if the array is `[1, 2, 3, 4]`, the result should be
//   `{ min: 1, max: 4, average: 2.5 }`.
//
// Hint: what does `iter` return? What methods does it have?

import { Optional, iter } from '@votingworks/basics';
import { TODO } from '../src/todo';
import { run } from '../src/example';

function computeMin(values: number[]): Optional<number> {
  TODO();
}

function computeMax(values: number[]): Optional<number> {
  TODO();
}

function computeAverage(values: number[]): Optional<number> {
  TODO();
}

function computeMinReference(values: number[]): Optional<number> {
  let min: Optional<number>;

  for (const value of values) {
    if (min === undefined || value < min) {
      min = value;
    }
  }

  return min;
}

function computeMaxReference(values: number[]): Optional<number> {
  let max: Optional<number>;

  for (const value of values) {
    if (max === undefined || value > max) {
      max = value;
    }
  }

  return max;
}

function computeAverageReference(values: number[]): Optional<number> {
  if (values.length === 0) {
    return undefined;
  }

  let sum = 0;

  for (const value of values) {
    sum += value;
  }

  return sum / values.length;
}

run({
  name: 'min',
  makeInput: () => [1, 2, 3, 4],
  referenceImplementation: computeMinReference,
  exerciseImplementation: computeMin,
  solutionImplementation: computeMinSolution,
});

run({
  name: 'max',
  makeInput: () => [1, 2, 3, 4],
  referenceImplementation: computeMaxReference,
  exerciseImplementation: computeMax,
  solutionImplementation: computeMaxSolution,
});

run({
  name: 'average',
  makeInput: () => [1, 2, 3, 4],
  referenceImplementation: computeAverageReference,
  exerciseImplementation: computeAverage,
  solutionImplementation: computeAverageSolution,
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

function computeMinSolution(values: number[]): Optional<number> {
  return iter(values).min();
}

function computeMaxSolution(values: number[]): Optional<number> {
  return iter(values).max();
}

function computeAverageSolution(values: number[]): Optional<number> {
  return iter(values).sum() / values.length;
}
