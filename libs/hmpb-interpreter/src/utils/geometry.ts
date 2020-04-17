import { Point, Rect } from '../types'

export function rectPoints({ x, y, width, height }: Rect): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x, y: y + height },
    { x: x + width, y: y + height },
  ]
}
