import { assert } from '@votingworks/basics';
import { Bit, Point, Rect, Vector } from './types';

/**
 * Builds a point from the given `x` and `y` values.
 */
export function loc(x: number, y: number): Point {
  return { x, y } as unknown as Point;
}

/**
 * Builds a vector from the given `x` and `y` values.
 */
export function vec(x: number, y: number): Vector {
  return { x, y } as unknown as Vector;
}

/**
 * Gets the point at the center of the given rectangle.
 */
export function centerOfRect(rect: Rect): Point {
  return loc((rect.minX + rect.maxX) / 2, (rect.minY + rect.maxY) / 2);
}

/**
 * Builds a rectangle from the given points.
 */
export function makeRect({
  minX,
  minY,
  maxX,
  maxY,
}: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}): Rect {
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    minX,
    minY,
    maxX,
    maxY,
  };
}

/**
 * Computes the intersection of of two rays.
 *
 * TODO: does this duplicate the {@link intersectionOfLineSegments} function?
 */
export function calculateIntersection(
  point1: Point,
  angle1: number,
  point2: Point,
  angle2: number
): Point | undefined {
  if ((((angle1 - angle2) % Math.PI) + Math.PI) % Math.PI === 0) {
    // parallel
    return undefined;
  }

  if (((angle1 % Math.PI) + Math.PI) % Math.PI === Math.PI / 2) {
    // angle1 is vertical
    return loc(point1.x, point2.y + Math.tan(angle2) * (point1.x - point2.x));
  }

  if (((angle2 % Math.PI) + Math.PI) % Math.PI === Math.PI / 2) {
    // angle2 is vertical
    return loc(point2.x, point1.y + Math.tan(angle1) * (point2.x - point1.x));
  }

  const m1 = Math.tan(angle1);
  const m2 = Math.tan(angle2);
  const x = (m1 * point1.x - m2 * point2.x - (point1.y - point2.y)) / (m1 - m2);
  return loc(x, m1 * (x - point1.x) + point1.y);
}

/**
 * Converts degrees to radians.
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts degrees to radians.
 */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Computes the angle of a vector.
 */
export function vectorAngle(vector: Vector): number {
  return Math.atan2(vector.y, vector.x);
}

/**
 * Computes the angle between the given points. Returns a value between 0 and
 * 2π.
 */
export function angleBetweenPoints(point1: Point, point2: Point): number {
  return (
    (2 * Math.PI + Math.atan2(point2.y - point1.y, point2.x - point1.x)) %
    Math.PI
  );
}

/**
 * Normalizes an angle to the range [0, π), where 0 and π represent the same
 * angle.
 */
export function normalizeHalfAngle(angle: number): number {
  return (angle % Math.PI) + (angle < 0 ? Math.PI : 0);
}

/**
 * Determines whether two angles are approximately colinear.
 */
export function checkApproximatelyColinear(
  angle1: number,
  angle2: number,
  tolerance: number
): boolean {
  const angleDiff = normalizeHalfAngle(
    normalizeHalfAngle(angle1) - normalizeHalfAngle(angle2)
  );
  return angleDiff <= tolerance || angleDiff >= Math.PI - tolerance;
}

/**
 * Computes a number from `bits` or a subset.
 *
 * @param bits Bits in LSB to MSB order.
 */
export function bitsToNumber(
  bits: readonly Bit[],
  startIndex = 0,
  endIndex = bits.length
): number {
  assert(startIndex >= 0);
  assert(endIndex <= bits.length);
  assert(startIndex <= endIndex);

  let result = 0;
  for (let i = endIndex - 1; i >= startIndex; i -= 1) {
    result = result * 2 + (bits[i] as number);
  }
  return result;
}
