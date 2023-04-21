import {
  bitsToNumber,
  calculateIntersection,
  checkApproximatelyColinear,
  loc,
} from './utils';

test('calculateIntersection', () => {
  // simple right angles
  expect(calculateIntersection(loc(0, 0), 0, loc(0, 0), Math.PI / 2)).toEqual(
    loc(0, 0)
  );
  expect(calculateIntersection(loc(0, 0), 0, loc(5, 5), Math.PI / 2)).toEqual(
    loc(5, 0)
  );

  // parallel lines
  expect(calculateIntersection(loc(0, 0), 0, loc(1, 1), 0)).toBeUndefined();
  expect(
    calculateIntersection(loc(0, 0), 0, loc(1, 1), Math.PI)
  ).toBeUndefined();

  // colinear lines
  expect(
    calculateIntersection(loc(0, 0), Math.PI / 2, loc(0, 1), Math.PI / 2)
  ).toBeUndefined();
  expect(
    calculateIntersection(loc(0, 0), Math.PI / 2, loc(0, 1), (Math.PI * 3) / 2)
  ).toBeUndefined();

  // intersection
  const point = calculateIntersection(
    loc(10, 10),
    Math.PI / 4,
    loc(0, 5),
    -Math.PI / 4
  );
  expect(point?.x).toBeCloseTo(2.5);
  expect(point?.y).toBeCloseTo(2.5);
});

test('bitsToNumber', () => {
  expect(bitsToNumber([])).toEqual(0);
  expect(bitsToNumber([1])).toEqual(1);
  expect(bitsToNumber([1], 1)).toEqual(0);
  expect(bitsToNumber([0, 1])).toEqual(2);
  expect(bitsToNumber([0, 1], 1)).toEqual(1);
  expect(bitsToNumber([0, 1], 0, 1)).toEqual(0);
  expect(bitsToNumber([0, 1], 1, 2)).toEqual(1);
  expect(bitsToNumber([1, 1, 1, 1, 1, 1, 1, 1])).toEqual(0xff);
});

test('checkApproximatelyColinear', () => {
  const degree = Math.PI / 180;
  expect(checkApproximatelyColinear(0, 0, 0)).toEqual(true);
  expect(checkApproximatelyColinear(0, Math.PI, 0)).toEqual(true);
  expect(checkApproximatelyColinear(1 * degree, 0, 1 * degree)).toEqual(true);
  expect(checkApproximatelyColinear(1 * degree, Math.PI, 1 * degree)).toEqual(
    true
  );
  expect(checkApproximatelyColinear(1 * degree, Math.PI, 0)).toEqual(false);
  expect(
    checkApproximatelyColinear(1 * degree, -1 * degree, 2 * degree)
  ).toEqual(true);
});
