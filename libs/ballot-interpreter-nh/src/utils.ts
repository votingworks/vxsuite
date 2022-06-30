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
  segment1: Segment,
  segment2: Segment,
  options?: { bounded?: boolean }
): Point | undefined;
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
  options?: { bounded?: boolean }
): Point | undefined;
/**
 * Finds the intersection of two line segments. If {@link bounded} is `false`,
 * the segments are treated as lines that extend infinitely in both directions.
 * Otherwise the intersection must be within the segments.
 *
 * If the segments are parallel or colinear, returns `undefined`.
 */
export function intersectionOfLineSegments(
  arg1: Point | Segment,
  arg2: Vector | Segment,
  arg3?: Point | { bounded?: boolean },
  arg4?: Vector,
  arg5?: { bounded?: boolean }
): Point | undefined {
  let p: Point;
  let r: Vector;
  let q: Point;
  let s: Vector;
  let bounded: boolean;

  if (arguments.length < 4) {
    const segment1 = arg1 as Segment;
    const segment2 = arg2 as Segment;
    const options = arg3 as { bounded?: boolean } | undefined;
    p = segment1.from;
    r = heading(segment1.from, segment1.to);
    q = segment2.from;
    s = heading(segment2.from, segment2.to);
    bounded = options?.bounded ?? true;
  } else {
    p = arg1 as Point;
    r = arg2 as Vector;
    q = arg3 as Point;
    s = arg4 as Vector;
    bounded = arg5?.bounded ?? true;
  }

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
 * Extends a line segment to a given length.
 */
export function extendLineSegmentToLength(
  segment: Segment,
  length: number
): Segment {
  const vector = heading(segment.from, segment.to);
  const unitVector = vectorMult(vector, 1 / distance(segment.from, segment.to));
  return {
    from: segment.from,
    to: translate(segment.from, vectorMult(unitVector, length)),
  };
}

/**
 * Determines whether a rect intersects a line segment, even if only at a single
 * point.
 */
export function getRectSegmentIntersectionPoints(
  rect: Rect,
  segment: Segment
): Point[] {
  const segmentOrigin = segment.from;
  const segmentVector = heading(segment.from, segment.to);

  const leftSideIntersection = intersectionOfLineSegments(
    loc(rect.minX, rect.minY),
    vec(0, rect.height),
    segmentOrigin,
    segmentVector,
    { bounded: true }
  );

  const rightSideIntersection = intersectionOfLineSegments(
    loc(rect.maxX, rect.minY),
    vec(0, rect.height),
    segmentOrigin,
    segmentVector,
    { bounded: true }
  );

  const topSideIntersection = intersectionOfLineSegments(
    loc(rect.minX, rect.minY),
    vec(rect.width, 0),
    segmentOrigin,
    segmentVector,
    { bounded: true }
  );

  const bottomSideIntersection = intersectionOfLineSegments(
    loc(rect.minX, rect.maxY),
    vec(rect.width, 0),
    segmentOrigin,
    segmentVector,
    { bounded: true }
  );

  const intersectionPoints = [
    leftSideIntersection,
    rightSideIntersection,
    topSideIntersection,
    bottomSideIntersection,
  ].filter((point): point is Point => point !== undefined);

  return intersectionPoints;
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
  const leftOrTopIntersection =
    leftSideIntersection && rectContainsPoint(rect, leftSideIntersection)
      ? leftSideIntersection
      : topSideIntersection;
  const rightOrBottomIntersection =
    rightSideIntersection && rectContainsPoint(rect, rightSideIntersection)
      ? rightSideIntersection
      : bottomSideIntersection;
  const from =
    segmentVector.x > 0 ? leftOrTopIntersection : rightOrBottomIntersection;
  const to =
    segmentVector.x > 0 ? rightOrBottomIntersection : leftOrTopIntersection;

  return from && to ? { from, to } : undefined;
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
