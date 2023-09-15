import * as fc from 'fast-check';

import { getRandomInteger } from './random';

test.each<{ min: number; max: number; expectedErrorMessage: string }>([
  { min: 0.1, max: 10, expectedErrorMessage: 'min should be an integer' },
  { min: 0, max: 10.1, expectedErrorMessage: 'max should be an integer' },
  { min: 1000, max: 0, expectedErrorMessage: 'min should be less than max' },
])(
  'getRandomInteger with invalid inputs',
  ({ min, max, expectedErrorMessage }) => {
    expect(() => getRandomInteger({ min, max })).toThrow(
      new Error(expectedErrorMessage)
    );
  }
);

test('getRandomInteger with valid inputs', () => {
  fc.assert(
    fc.property(fc.integer(), fc.integer(), (n1, n2) => {
      if (n1 === n2) {
        return;
      }
      const [min, max] = n1 < n2 ? [n1, n2] : [n2, n1];
      const randomInteger = getRandomInteger({ min, max });
      expect(Number.isInteger(randomInteger)).toEqual(true);
      expect(randomInteger).toBeGreaterThanOrEqual(min);
      expect(randomInteger).toBeLessThanOrEqual(max);
    })
  );
});

test('getRandomInteger is inclusive of min and max', () => {
  let got0 = false;
  let got1 = false;
  for (let i = 0; i < 100; i += 1) {
    const randomInteger = getRandomInteger({ min: 0, max: 1 });
    expect([0, 1].includes(randomInteger)).toEqual(true);
    if (!got0 && randomInteger === 0) got0 = true;
    if (!got1 && randomInteger === 1) got1 = true;
    if (got0 && got1) break;
  }
  expect(got0 && got1).toEqual(true);
});
