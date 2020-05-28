import { Point, Rect } from '../types'

export interface Options {
  readonly columns: readonly boolean[]
  readonly down?: boolean
}

export default function* scanColumns(
  bounds: Rect,
  { columns, down = true }: Options
): Generator<Point, void, number | undefined> {
  const colWidth = bounds.width / columns.length

  for (const [i, columnEnabled] of columns.entries()) {
    if (!columnEnabled) {
      continue
    }

    const x = bounds.x + Math.floor((i + 0.5) * colWidth)
    const yMin = bounds.y
    const yMax = bounds.y + bounds.height
    let y = down ? yMin : yMax

    while (down ? y <= yMax : y >= yMin) {
      const skipTo = yield { x, y }

      if (typeof skipTo !== 'undefined') {
        if (down ? skipTo <= y : skipTo >= y) {
          throw new Error(
            `cannot skip from (${x}, ${y}) to (${x}, ${y}) because it has already been visited`
          )
        }
        y = skipTo
      } else {
        y += down ? 1 : -1
      }
    }
  }
}
