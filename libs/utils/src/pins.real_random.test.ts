import fc from 'fast-check';

import { generatePin, isWeakPin, MAX_PIN_LENGTH, MIN_PIN_LENGTH } from './pins';

test('generatePIN returns no weak PINs', () => {
  fc.assert(
    fc.property(fc.integer(MIN_PIN_LENGTH, MAX_PIN_LENGTH), (length) => {
      const pin = generatePin(length);
      expect(isWeakPin(pin)).toBe(false);
    })
  );
});
