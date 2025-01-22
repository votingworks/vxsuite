// Helper functions for working with vector clocks

import { VectorClock } from './types';

// Merges two vector clocks, taking the maximum value for each key and returning the merged clock.
export function mergeVectorClocks(
  clock1: VectorClock,
  clock2: VectorClock
): VectorClock {
  const mergedClock: VectorClock = { ...clock1 };
  for (const [key, value] of Object.entries(clock2)) {
    if (mergedClock[key] === undefined || mergedClock[key] < value) {
      mergedClock[key] = value;
    }
  }
  return mergedClock;
}

// Returns true if the first clock is later then the second clock
// This does not mean that the first clock is causally after the second clock, only has at least one node that it is later.
export function isLater(clock1: VectorClock, clock2: VectorClock): boolean {
  const keys = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);
  for (const key of keys) {
    if ((clock1[key] || -1) > (clock2[key] || -1)) {
      return true;
    }
  }
  return false;
}

// Compares two vector clocks.
// If a is causally before b, returns -1. This means that every event in A happened before or at the same time as every event in B with at least one event being before.
// If a is causally after b, returns 1. This means that every event in A happened after or at the same time as every event in B with at least one event being after.
// If the events are concurrent, all clock events are identical or there are some events before and some after, returns 0. This means that there is no causal relationship between the two clocks and another deterministic method should be used to order events consistently.
export function compareVectorClocks(
  clock1: VectorClock,
  clock2: VectorClock
): number {
  let isBefore = false;
  let isAfter = false;
  const keys = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);

  for (const key of keys) {
    const aValue = clock1[key] || -1;
    const bValue = clock2[key] || -1;

    if (aValue < bValue) {
      isBefore = true;
    } else if (aValue > bValue) {
      isAfter = true;
    }

    if (isBefore && isAfter) {
      return 0; // Concurrent
    }
  }

  if (isBefore) {
    return -1; // a is causally before b
  }
  if (isAfter) {
    return 1; // a is causally after b
  }
  return 0; // Identical
}
