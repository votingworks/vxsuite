import { Corners, Point, Rect, Vector } from '../types'
import { strict as assert } from 'assert'

/**
 * Gets the four extreme points of a rectangle, inclusive.
 */
export function rectCorners({ x, y, width, height }: Rect): Corners {
  return [
    { x, y },
    { x: x + width - 1, y },
    { x, y: y + height - 1 },
    { x: x + width - 1, y: y + height - 1 },
  ]
}

/**
 * Gets the center point of a rectangle, optionally rounded.
 */
export function rectCenter(
  { x, y, width, height }: Rect,
  { round = false } = {}
): Point {
  const center = { x: x + (width - 1) / 2, y: y + (height - 1) / 2 }
  const result = round ? roundPoint(center) : center
  return result
}

/**
 * Determines whether `rect` contains `point`.
 */
export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  )
}

/**
 * Clips `rect` to be contained within `bounds`.
 */
export function rectClip(rect: Rect, bounds: Rect): Rect {
  const left = Math.max(rect.x, bounds.x)
  const top = Math.max(rect.y, bounds.y)
  const right = Math.min(rect.x + rect.width, bounds.x + bounds.width)
  const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height)
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

export function rectScale(rect: Rect, scale: number): Rect {
  return {
    x: rect.x * scale,
    y: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  }
}

export function rectInset(rect: Rect, inset: number): Rect {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: rect.width - 2 * inset,
    height: rect.height - 2 * inset,
  }
}

/**
 * Rounds a point to the nearest integer axis values.
 */
export function roundPoint(
  { x, y }: Point,
  { round = Math.round } = {}
): Point {
  return { x: round(x), y: round(y) }
}

/**
 * Flips a `Rect` vertically and horizontally within another `Rect`, equivalent
 * to a 180° rotation.
 *
 * @param outer bounding rectangle containing `inner` to flip within
 * @param inner rectangle to flip within `outer`
 */
export function flipRectVH(outer: Rect, inner: Rect): Rect {
  return {
    x: outer.x + outer.width - (inner.x + inner.width),
    y: outer.y + outer.height - (inner.y + inner.height),
    width: inner.width,
    height: inner.height,
  }
}

/**
 * Find how many pixel moves it takes to get from a to b.
 */
export function editDistance(a: Point, b: Point): number {
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
}

export function euclideanDistance(a: Point, b: Point): number {
  return ((b.x - a.x) ** 2 + (b.y - a.y) ** 2) ** 0.5
}

/**
 * Find the median of a list of numbers.
 */
export function median(numbers: ArrayLike<number>): number {
  assert(numbers.length > 0)

  if (numbers.length === 1) {
    return numbers[0]
  }

  const sorted = Array.from(numbers).sort()

  if (sorted.length % 2 === 0) {
    const halfway = sorted.length / 2
    return (sorted[halfway] + sorted[halfway + 1]) / 2
  }

  return sorted[Math.ceil(sorted.length / 2)]
}

/**
 * Compute the inner angle formed by vectors `ba` and `bc`.
 *
 * @see https://math.stackexchange.com/a/361419
 */
export function angleBetweenPoints(a: Point, b: Point, c: Point): number {
  const abDotBc = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)
  const abDist = euclideanDistance(a, b)
  const bcDist = euclideanDistance(b, c)
  return Math.acos(abDotBc / (abDist * bcDist))
}

/**
 * Compute the area of a triangle.
 *
 * @see https://www.mathopenref.com/coordtrianglearea.html
 */
export function triangleArea(a: Point, b: Point, c: Point): number {
  return Math.abs(
    (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2
  )
}

/**
 * Compute the area of a 4-sided polygon.
 */
export function poly4Area([
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
]: Corners): number {
  return (
    triangleArea(topLeft, bottomLeft, bottomRight) +
    triangleArea(topLeft, topRight, bottomRight)
  )
}

/**
 * v - w
 */
export function vectorSub(v: Vector, w: Vector): Vector {
  return { x: v.x - w.x, y: v.y - w.y }
}

/**
 * v + w
 */
export function vectorAdd(v: Vector, w: Vector): Vector {
  return { x: v.x + w.x, y: v.y + w.y }
}

/**
 * s * v
 */
export function vectorScale(v: Vector, s: number): Vector {
  return { x: v.x * s, y: v.y * s }
}
