import { describe, expect, test } from 'vitest';
import { normalizeState, UsState } from './types';

describe('normalizeState', () => {
  test.each([
    {
      input: ['nh', 'NH', 'New Hampshire', 'NEW HAMPSHIRE'],
      expectedState: UsState.NEW_HAMPSHIRE,
    },
    {
      input: ['ms', 'MS', 'Mississippi', 'MISSISSIPPI'],
      expectedState: UsState.MISSISSIPPI,
    },
    {
      input: ['State of Hamilton'],
      expectedState: UsState.UNKNOWN,
    },
  ])('normalizes state string: $expectedState', ({ input, expectedState }) => {
    for (const state of input) {
      expect(normalizeState(state)).toEqual(expectedState);
    }
  });
});
