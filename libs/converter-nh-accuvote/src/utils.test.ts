import { calculateIntersection, loc } from './utils';

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
