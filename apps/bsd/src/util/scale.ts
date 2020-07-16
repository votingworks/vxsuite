import { Rect } from '@votingworks/hmpb-interpreter'

export interface Scaler {
  /**
   * Scale `value` by a scaling factor.
   */
  (value: number): number

  /**
   * Scale size and position of `value` by a scaling factor.
   */
  rect(value: Rect): Rect
}

/**
 * Builds a function to scale scalars and rects.
 */
export function scaler(scale: number): Scaler {
  const result: Scaler = (value) => value * scale

  result.rect = (value) => ({
    x: value.x * scale,
    y: value.y * scale,
    width: value.width * scale,
    height: value.height * scale,
  })

  return result
}
