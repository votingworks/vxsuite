import fc from 'fast-check';
import { checkApproximatelyColinear, normalizeHalfAngle } from './geometry';

const ONE_DEG = Math.PI / 180;
const NINETY_DEG = Math.PI / 2;
const ONE_EIGHTY_DEG = Math.PI;
const ONE_SEC = ONE_DEG / 3600;

test('normalizeHalfAngle', () => {
  expect(normalizeHalfAngle(0)).toEqual(0);
  expect(normalizeHalfAngle(ONE_EIGHTY_DEG)).toEqual(0);
  expect(normalizeHalfAngle(NINETY_DEG)).toEqual(NINETY_DEG);
  expect(normalizeHalfAngle(NINETY_DEG + ONE_EIGHTY_DEG)).toEqual(NINETY_DEG);
});

test('normalizeHalfAngle is always the same +/- 2Nπ', () => {
  fc.assert(
    fc.property(
      fc.float({
        min: 2 * -ONE_EIGHTY_DEG,
        max: 2 * ONE_EIGHTY_DEG,
      }),
      fc.integer({ min: -100, max: 100 }),
      (angle, rotations) => {
        expect(
          normalizeHalfAngle(angle + rotations * 2 * ONE_EIGHTY_DEG)
        ).toBeCloseTo(normalizeHalfAngle(angle));
      }
    )
  );
});

test('checkApproximatelyColinear', () => {
  expect(checkApproximatelyColinear(0, 0, 0)).toEqual(true);
  expect(checkApproximatelyColinear(0, ONE_EIGHTY_DEG, 0)).toEqual(true);
  expect(checkApproximatelyColinear(0, NINETY_DEG, 0)).toEqual(false);

  // any angle is colinear with itself
  fc.assert(
    fc.property(
      fc.float({ min: -ONE_EIGHTY_DEG, max: ONE_EIGHTY_DEG }),
      (angle) => {
        expect(checkApproximatelyColinear(angle, angle, ONE_SEC)).toEqual(true);
      }
    )
  );

  // any angle is colinear with itself + Nπ
  fc.assert(
    fc.property(
      fc.float({ min: -ONE_EIGHTY_DEG, max: ONE_EIGHTY_DEG }),
      fc.integer(),
      (angle, n) => {
        expect(
          checkApproximatelyColinear(angle, angle + n * ONE_EIGHTY_DEG, ONE_SEC)
        ).toEqual(true);
      }
    )
  );

  // any angle is colinear with any other given a large enough threshold
  fc.assert(
    fc.property(
      fc.float({ min: -ONE_EIGHTY_DEG, max: ONE_EIGHTY_DEG }),
      fc.float({ min: -ONE_EIGHTY_DEG, max: ONE_EIGHTY_DEG }),
      (angle1, angle2) => {
        expect(
          checkApproximatelyColinear(angle1, angle2, ONE_EIGHTY_DEG)
        ).toEqual(true);
      }
    )
  );
});
