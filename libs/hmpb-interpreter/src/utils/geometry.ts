import { Corners, Rect } from '../types'

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
