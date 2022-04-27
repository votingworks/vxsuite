import crypto from 'crypto';

import { randomBase64 } from './random';

test('randomBase64 generates strings of the expected length', () => {
  // globalThis.crypto is not defined in JSDOM
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues(arr: Parameters<typeof crypto['randomFillSync']>[0]) {
        return crypto.randomFillSync(arr);
      },
    },
  });

  expect(randomBase64(10)).toHaveLength(14);
});
