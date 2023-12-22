// 02-map.ts
//
// Task: Complete the `convertAllCelsiusToFahrenheit` function using `iter` to convert
// a list of celsius values to fahrenheit.
//
// Hint: what does `iter` return? What methods does it have?

import { iter } from '@votingworks/basics';
import { run } from '../src/example';
import { TODO } from '../src/todo';
import { collecting } from '../src/collecting';

function convertCelsiusToFahrenheit(celsius: number): number {
  return celsius * (9 / 5) + 32;
}

function convertAllCelsiusToFahrenheit(
  celsiusValues: Iterable<number>
): Iterable<number> {
  TODO();
}

function convertAllCelsiusToFahrenheitReference(
  celsiusValues: number[]
): number[] {
  return celsiusValues.map(convertCelsiusToFahrenheit);
}

const DAILY_MAXIMUM_CELSIUS_TEMPERATURES = [
  20.0, 25.0, 18.0, 22.0, 27.0, 30.0, 28.0, 23.0, 19.0, 25.0,
];

run({
  makeInput: () => DAILY_MAXIMUM_CELSIUS_TEMPERATURES,
  referenceImplementation: convertAllCelsiusToFahrenheitReference,
  exerciseImplementation: collecting(convertAllCelsiusToFahrenheit),
  solutionImplementation: collecting(convertAllCelsiusToFahrenheitSolution),
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

function convertAllCelsiusToFahrenheitSolution(
  celsiusValues: Iterable<number>
): Iterable<number> {
  return iter(celsiusValues).map(convertCelsiusToFahrenheit);
}
