import { expect, test } from 'vitest';
import fc from 'fast-check';
import { valuesEncodeEquivalently } from './equality';
import { uint8 } from './uint8_coder';

test('encodesEquivalent', () => {
  const coder = uint8();

  fc.assert(
    fc.property(fc.integer(0, 0xff), (value) => {
      expect(valuesEncodeEquivalently(coder, value, value)).toEqual(true);
    })
  );

  fc.assert(
    fc.property(fc.integer(0, 0xff), fc.integer(0, 0xff), (a, b) => {
      if (a !== b) {
        expect(valuesEncodeEquivalently(coder, a, b)).toEqual(false);
      }
    })
  );
});
