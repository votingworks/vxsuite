import { Rect } from '@votingworks/ballot-interpreter-nh';
import { Point, Vector } from './types';

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
  return loc(rect.left + rect.width / 2, rect.top + rect.height / 2);
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
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Computes the intersection of of two rays.
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
