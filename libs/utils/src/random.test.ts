import { expect, test } from 'vitest';
import crypto from 'node:crypto';

import { randomBallotId } from './random';

// globalThis.crypto is not defined in JSDOM
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues(arr: Parameters<(typeof crypto)['randomFillSync']>[0]) {
      return crypto.randomFillSync(arr);
    },
  },
});

test('randomBallotId generates a random ballot ID', () => {
  expect(randomBallotId()).toHaveLength(14);
});
