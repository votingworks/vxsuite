// 08-advanced.ts
//
// Task: Complete the functions below to compute the relevant statistics for the
// provided weather data.
//

import { Optional, assertDefined, iter, typedAs } from '@votingworks/basics';
import { TODO } from '../src/todo';
import { run } from '../src/example';
import { collecting } from '../src/collecting';

function consecutiveDayTemperatureDifferences(
  celsiusValues: Iterable<number>
): Iterable<number> {
  TODO();
}

function* consecutiveDayTemperatureDifferencesReference(
  celsiusValues: Iterable<number>
): Iterable<number> {
  let previousValue: Optional<number>;

  for (const value of celsiusValues) {
    if (previousValue !== undefined) {
      yield value - previousValue;
    }

    previousValue = value;
  }
}

interface IdentifyHeatWavesInput {
  values: Iterable<number>;
  threshold: number;
  length: number;
}

function identifyHeatWaves({
  values,
  threshold,
  length,
}: IdentifyHeatWavesInput): Iterable<number> {
  TODO();
}

function* identifyHeatWavesReference({
  values,
  threshold,
  length,
}: IdentifyHeatWavesInput): Iterable<number> {
  let heatWaveStart: Optional<number>;
  let currentIndex = 0;

  for (const value of values) {
    if (value >= threshold) {
      heatWaveStart ??= currentIndex;
    }

    if (heatWaveStart !== undefined && currentIndex - heatWaveStart >= length) {
      yield currentIndex - length;
    }

    if (value < threshold) {
      heatWaveStart = undefined;
    }

    currentIndex += 1;
  }

  if (heatWaveStart !== undefined && currentIndex - heatWaveStart >= length) {
    yield currentIndex - length;
  }
}

const DAILY_MAXIMUM_CELSIUS_TEMPERATURES = [
  20.0, 25.0, 18.0, 22.0, 27.0, 30.0, 28.0, 23.0, 19.0, 25.0,
];
const HIGH_TEMPERATURE_CELSIUS_THRESHOLD = 25;

run({
  name: 'consecutiveDayTemperatureDifferences',
  makeInput: () => DAILY_MAXIMUM_CELSIUS_TEMPERATURES,
  referenceImplementation: collecting(
    consecutiveDayTemperatureDifferencesReference
  ),
  exerciseImplementation: collecting(consecutiveDayTemperatureDifferences),
  solutionImplementation: collecting(
    consecutiveDayTemperatureDifferencesSolution
  ),
});

run({
  name: 'identifyHeatWaves (length 3, min 25°C)',
  makeInput: () =>
    typedAs<IdentifyHeatWavesInput>({
      values: DAILY_MAXIMUM_CELSIUS_TEMPERATURES,
      threshold: HIGH_TEMPERATURE_CELSIUS_THRESHOLD,
      length: 3,
    }),
  referenceImplementation: collecting(identifyHeatWavesReference),
  exerciseImplementation: collecting(identifyHeatWaves),
  solutionImplementation: collecting(identifyHeatWavesSolution),
});

run({
  name: 'identifyHeatWaves (length 4, min 20°C)',
  makeInput: () =>
    typedAs<IdentifyHeatWavesInput>({
      values: DAILY_MAXIMUM_CELSIUS_TEMPERATURES,
      threshold: 20,
      length: 4,
    }),
  referenceImplementation: collecting(identifyHeatWavesReference),
  exerciseImplementation: collecting(identifyHeatWaves),
  solutionImplementation: collecting(identifyHeatWavesSolution),
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

// Use `windows` to get pairs of adjacent elements, then `map` to compute the
// difference for each pair.
function consecutiveDayTemperatureDifferencesSolution(
  celsiusValues: Iterable<number>
): Iterable<number> {
  return iter(celsiusValues)
    .windows(2)
    .map(([previous, current]) => current - previous);
}

// Use `enumerate` to pair each value with its index, then look at each
// consecutive window of the specified length and filter to only those windows
// where every value is greater than or equal to the threshold. Finally, use
// `map` to extract the index of the first value in each window.
function identifyHeatWavesSolution({
  values,
  threshold,
  length,
}: IdentifyHeatWavesInput): Iterable<number> {
  return iter(values)
    .enumerate()
    .windows(length)
    .filter((window) => window.every(([, value]) => value >= threshold))
    .map((window) => assertDefined(window[0])[0]);
}
