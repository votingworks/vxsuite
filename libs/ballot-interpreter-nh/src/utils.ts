import { assert } from '@votingworks/utils';
import { Bit, Point, Rect, Segment, Vector } from './types';

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
 * Computes the distance between two points.
 */
export function distance(from: Point, to: Point): number {
  return Math.sqrt((from.x - to.x) ** 2 + (from.y - to.y) ** 2);
}

/**
 * Computes the median value of a list of numbers.
 */
export function median(values: number[]): number {
  const sorted = [...values].sort();
  const mid = sorted.length / 2;
  if (sorted.length % 2 === 1) {
    return sorted[Math.floor(mid)] as number;
  }
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Computes the average value of a list of numbers.
 */
export function average(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Computes the standard deviation of the given values.
 */
export function stddev(values: readonly number[]): number {
  const mean = average(values);
  const squaredDifferences = values.map((value) => (value - mean) ** 2);
  return Math.sqrt(average(squaredDifferences));
}

/**
 * Computes the cross product of two vectors.
 *
 * @see https://en.wikipedia.org/wiki/Cross_product
 */
export function crossProduct(v: Vector, w: Vector): number {
  return v.x * w.y - v.y * w.x;
}

/**
 * Computes the dot product of two vectors.
 *
 * @see https://en.wikipedia.org/wiki/Dot_product
 */
export function dotProduct(v: Vector, w: Vector): number {
  return v.x * w.x + v.y * w.y;
}

/**
 * Adds two vectors.
 */
export function vectorAdd(v: Vector, w: Vector): Vector {
  return vec(v.x + w.x, v.y + w.y);
}

/**
 * Subtracts two vectors.
 */
export function vectorSub(v: Vector, w: Vector): Vector {
  return vec(v.x - w.x, v.y - w.y);
}

/**
 * Multiplies a vector by a scalar.
 */
export function vectorMult(v: Vector, s: number): Vector {
  return vec(v.x * s, v.y * s);
}

/**
 * Translates a point by a vector.
 */
export function translate(p: Point, v: Vector): Point {
  return loc(p.x + v.x, p.y + v.y);
}

/**
 * Gets the vector that connects two points.
 */
export function heading(from: Point, to: Point): Vector {
  return vec(to.x - from.x, to.y - from.y);
}

/**
 * Finds the intersection of two line segments. If {@link bounded} is `false`,
 * the segments are treated as lines that extend infinitely in both directions.
 * Otherwise the intersection must be within the segments.
 *
 * If the segments are parallel or colinear, returns `undefined`.
 */
export function intersectionOfLineSegments(
  p: Point,
  r: Vector,
  q: Point,
  s: Vector,
  { bounded = true } = {}
): Point | undefined {
  const rxs = crossProduct(r, s);
  if (rxs === 0) {
    // parallel or colinear
    return undefined;
  }

  const qmp = heading(p, q);
  const t = crossProduct(qmp, s) / rxs;
  const u = crossProduct(qmp, r) / rxs;

  if (bounded && (t < 0 || t > 1 || u < 0 || u > 1)) {
    return undefined;
  }

  return translate(p, vectorMult(r, t));
}

/**
 * Determines the closest point on a line segment to a given point.
 */
export function closestPointOnLineSegmentToPoint(
  segment: Segment,
  point: Point
): Point {
  const vectorFromStartToPoint = heading(segment.from, point);
  const segmentVector = heading(segment.from, segment.to);

  const vectorMagnitude = segmentVector.x ** 2 + segmentVector.y ** 2;
  const vectorDotProduct = dotProduct(vectorFromStartToPoint, segmentVector);
  const normalizedDistanceFromStartToClosestPoint =
    vectorDotProduct / vectorMagnitude;

  if (normalizedDistanceFromStartToClosestPoint <= 0) {
    return segment.from;
  }
  if (normalizedDistanceFromStartToClosestPoint >= 1) {
    return segment.to;
  }

  return loc(
    segment.from.x +
      normalizedDistanceFromStartToClosestPoint * segmentVector.x,
    segment.from.y + normalizedDistanceFromStartToClosestPoint * segmentVector.y
  );
}

/**
 * Finds a line segment that intersects the given rectangle. If {@link bounded}
 * is `false`, the segment may be outside the rectangle. If {@link bounded} is
 * `true`, the segment must be inside the rectangle.
 */
export function segmentIntersectionWithRect(
  rect: Rect,
  segment: Segment,
  { bounded = true } = {}
): Segment | undefined {
  const segmentOrigin = segment.from;
  const segmentVector = heading(segment.from, segment.to);

  const leftSideIntersection = intersectionOfLineSegments(
    loc(rect.minX, rect.minY),
    vec(0, rect.height),
    segmentOrigin,
    segmentVector,
    { bounded }
  );
  const rightSideIntersection = intersectionOfLineSegments(
    loc(rect.maxX, rect.minY),
    vec(0, rect.height),
    segmentOrigin,
    segmentVector,
    { bounded }
  );
  const topSideIntersection = intersectionOfLineSegments(
    loc(rect.minX, rect.minY),
    vec(rect.width, 0),
    segmentOrigin,
    segmentVector,
    { bounded }
  );
  const bottomSideIntersection = intersectionOfLineSegments(
    loc(rect.minX, rect.maxY),
    vec(rect.width, 0),
    segmentOrigin,
    segmentVector,
    { bounded }
  );
  const from =
    segmentVector.x > 0
      ? leftSideIntersection ?? topSideIntersection
      : rightSideIntersection ?? bottomSideIntersection;
  const to =
    segmentVector.x > 0
      ? rightSideIntersection ?? bottomSideIntersection
      : leftSideIntersection ?? topSideIntersection;

  return from && to ? { from, to } : undefined;
}

/**
 * Gets the point at the center of the given rectangle.
 */
export function centerOfRect(rect: Rect): Point {
  return loc((rect.minX + rect.maxX) / 2, (rect.minY + rect.maxY) / 2);
}

/**
 * Determines whether the given point is inside the given rectangle.
 */
export function rectContainsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.minX &&
    point.x <= rect.maxX &&
    point.y >= rect.minY &&
    point.y <= rect.maxY
  );
}

/**
 * Finds all rects that overlap with each other.
 */
export function findOverlappingRects(rects: Iterable<Rect>): Set<[Rect, Rect]> {
  const allRects = [...rects];
  const overlappingRects = new Set<[Rect, Rect]>();
  for (const rect of allRects) {
    for (const otherRect of allRects) {
      if (rect === otherRect) {
        continue;
      }
      if (
        rectContainsPoint(rect, loc(otherRect.minX, otherRect.minY)) ||
        rectContainsPoint(rect, loc(otherRect.minX, otherRect.maxY)) ||
        rectContainsPoint(rect, loc(otherRect.maxX, otherRect.minY)) ||
        rectContainsPoint(rect, loc(otherRect.maxX, otherRect.maxY))
      ) {
        overlappingRects.add([rect, otherRect]);
      }
    }
  }
  return overlappingRects;
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

/**
 * Splits an array into chunks at split points determined by a predicate.
 */
export function splitAt<T>(
  array: readonly T[],
  predicate: (left: T, right: T) => boolean
): Array<T[]> {
  if (array.length < 2) {
    return [[...array]];
  }

  const chunks: Array<T[]> = [];
  let currentChunk: T[] = [];

  for (let i = 0; i < array.length; i += 1) {
    currentChunk.push(array[i] as T);
    if (i !== array.length - 1 && predicate(array[i] as T, array[i + 1] as T)) {
      chunks.push(currentChunk);
      currentChunk = [];
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
