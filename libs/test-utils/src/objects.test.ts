import { expect, test } from 'vitest';
import { countObjectLeaves, getObjectLeaves } from './objects';

const testObject: unknown = {
  a: 1,
  b: [2],
  c: {
    d: [{ e: 3 }],
    f: {
      g: '4',
      h: null,
      i: undefined,
    },
  },
};

test.each<{ input: unknown; expectedOutput: unknown[] }>([
  {
    input: testObject,
    expectedOutput: [1, [2], [{ e: 3 }], '4', null, undefined],
  },
  {
    input: {},
    expectedOutput: [],
  },
  {
    input: 1,
    expectedOutput: [],
  },
  {
    input: [],
    expectedOutput: [],
  },
])('getObjectLeaves - $input', ({ input, expectedOutput }) => {
  expect(getObjectLeaves(input).sort()).toEqual([...expectedOutput].sort());
});

test.each<{ input: unknown; expectedOutput: number }>([
  {
    input: testObject,
    expectedOutput: 6,
  },
  {
    input: {},
    expectedOutput: 0,
  },
  {
    input: 1,
    expectedOutput: 0,
  },
  {
    input: [],
    expectedOutput: 0,
  },
])('countObjectLeaves - $input', ({ input, expectedOutput }) => {
  expect(countObjectLeaves(input)).toEqual(expectedOutput);
});
