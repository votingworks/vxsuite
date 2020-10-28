import { Corners, Point, Rect } from '../types'

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

/**
 * Find the median of a list of numbers.
 */
export function median(numbers: ArrayLike<number>): number {
  if (numbers.length === 0) {
    throw new Error('median of empty array does not make sense')
  }

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
