import { Corners, Point, Rect } from '@votingworks/types';
import { assert } from '@votingworks/basics';

/**
 * Gets the four extreme points of a rectangle, inclusive.
 */
export function rectCorners({ x, y, width, height }: Rect): Corners {
  return [
    { x, y },
    { x: x + width - 1, y },
    { x, y: y + height - 1 },
    { x: x + width - 1, y: y + height - 1 },
  ];
}

/**
 * Rounds a point to the nearest integer axis values.
 */
export function roundPoint(
  { x, y }: Point,
  { round = Math.round } = {}
): Point {
  return { x: round(x), y: round(y) };
}

/**
 * Gets the center point of a rectangle, optionally rounded.
 */
export function rectCenter(
  { x, y, width, height }: Rect,
  { round = false } = {}
): Point {
  const center: Point = { x: x + (width - 1) / 2, y: y + (height - 1) / 2 };
  const result = round ? roundPoint(center) : center;
  return result;
}

/**
 * Flips a `Rect` vertically and horizontally within another `Rect`, equivalent
 * to a 180° rotation.
 *
 * @param outer bounding rectangle containing `inner` to flip within
 * @param inner rectangle to flip within `outer`
 */
export function flipRectVerticalAndHorizontal(outer: Rect, inner: Rect): Rect {
  return {
    x: outer.x + outer.width - (inner.x + inner.width),
    y: outer.y + outer.height - (inner.y + inner.height),
    width: inner.width,
    height: inner.height,
  };
}

/**
 * Find how many pixel moves it takes to get from a to b.
 */
export function editDistance(a: Point, b: Point): number {
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
}

export function euclideanDistance(a: Point, b: Point): number {
  return ((b.x - a.x) ** 2 + (b.y - a.y) ** 2) ** 0.5;
}

/**
 * Find the median of a list of numbers.
 */
export function median(numbers: ArrayLike<number>): number {
  assert(numbers.length > 0);

  if (numbers.length === 1) {
    return numbers[0];
  }

  const sorted = Array.from(numbers).sort();

  const halfway = Math.ceil(sorted.length / 2 - 1);
  if (sorted.length % 2 === 0) {
    return (sorted[halfway] + sorted[halfway + 1]) / 2;
  }

  return sorted[halfway];
}

/**
 * Compute the inner angle formed by vectors `ba` and `bc`.
 *
 * @see https://math.stackexchange.com/a/361419
 */
export function angleBetweenPoints(a: Point, b: Point, c: Point): number {
  const abDotBc = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y);
  const abDist = euclideanDistance(a, b);
  const bcDist = euclideanDistance(b, c);
  return Math.acos(abDotBc / (abDist * bcDist));
}

/**
 * Compute the area of a triangle.
 *
 * @see https://www.mathopenref.com/coordtrianglearea.html
 */
export function triangleArea(a: Point, b: Point, c: Point): number {
  return Math.abs(
    (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2
  );
}
