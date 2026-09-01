import { expect, test } from 'vitest';
import { assertDefined, throwIllegalValue } from './utils.js';

test('throwIllegalValue throws with the value', () => {
  expect(() => throwIllegalValue('oops' as never)).toThrow(
    'Illegal value: oops'
  );
});

test('assertDefined passes defined values through and rejects undefined', () => {
  expect(assertDefined(0)).toEqual(0);
  expect(() => assertDefined(undefined)).toThrow('Expected a defined value');
});
