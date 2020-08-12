import { Point } from '../types'

export default function* offsets(): Generator<Point> {
  let x = 0
  let y = 0
  for (;;) {
    yield { x, y }
    if (Math.abs(y) <= Math.abs(x) && (x !== y || y >= 0)) {
      y += x >= 0 ? 1 : -1
    } else {
      x += y >= 0 ? -1 : 1
    }
  }
}
