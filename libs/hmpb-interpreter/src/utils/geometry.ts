import { Corners, Offset, Point, Rect } from '../types'
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

export function rectShift(rect: Rect, offset: Offset): Rect {
  return {
    x: rect.x + offset.x,
    y: rect.y + offset.y,
    width: rect.width,
    height: rect.height,
  }
}

export function mergeRects(rect: Rect, ...rects: readonly Rect[]): Rect {
  if (rects.length === 0) {
    return rect
  }

  if (rects.length === 1) {
    const [other] = rects
    const x = Math.min(rect.x, other.x)
    const y = Math.min(rect.y, other.y)
    const rightEnd = Math.max(rect.x + rect.width, other.x + other.width)
    const bottomEnd = Math.max(rect.y + rect.height, other.y + other.height)
    return { x, y, width: rightEnd - x, height: bottomEnd - y }
  }

  const [next, ...rest] = rects
  return mergeRects(mergeRects(rect, next), ...rest)
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
 * Find the percentile value of a list of numbers.
 */
export function percentile(
  numbers: ArrayLike<number>,
  threshold: number
): number {
  assert(numbers.length > 0)

  if (numbers.length === 1) {
    return numbers[0]
  }

  const sorted = Array.from(numbers).sort()
  const index = threshold * (sorted.length - 1)
  const leftIndex = Math.floor(index)

  if (leftIndex === index) {
    return sorted[index]
  }

  const rightIndex = leftIndex + 1
  const leftPercentage = index - leftIndex
  const rightPercentage = 1 - leftPercentage

  const result =
    sorted[leftIndex] * leftPercentage + sorted[rightIndex] * rightPercentage
  console.log('getting', threshold, 'percentile at', {
    leftIndex,
    rightIndex,
    leftPercentage,
    rightPercentage,
    result,
  })
  return result
}

export function histogram(
  numbers: ArrayLike<number>,
  min: number,
  max: number
): Int32Array {
  assert(min <= max)

  const result = new Int32Array(max - min + 1)

  for (let i = 0; i < numbers.length; i++) {
    result[numbers[i] - min]++
  }

  return result
}

export function range(from: number, through: number): number[] {
  assert(from <= through)
  return new Array(through - from + 1).fill(0).map((_, i) => from + i)
}

export function* lineSegmentPixels(a: Point, b: Point): Generator<Point> {
  if (Math.abs(a.x - b.x) < Math.abs(a.y - b.y)) {
    for (const { x, y } of lineSegmentPixels(
      { x: a.y, y: a.x },
      { x: b.y, y: b.x }
    )) {
      yield { x: y, y: x }
    }
  } else {
    const steps = Math.abs(b.x - a.x)
    const xStep = a.x < b.x ? 1 : -1
    for (let i = 0; i < steps; i++) {
      yield {
        x: a.x + i * xStep,
        y: Math.round(a.y + ((b.y - a.y) * i) / steps),
      }
    }
  }
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
