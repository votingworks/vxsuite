import { Rect } from '../types'
import scanColumns from './scanColumns'
import { findShapes, Shape } from './shapes'

export default function* findTargets(
  ballotImage: ImageData,
  bounds: Rect,
  { aspectRatio = 1.5, aspectRatioTolerance = 0.1 } = {}
): Generator<Shape> {
  let nextY: number | undefined
  const shapeIterator = findShapes(
    ballotImage,
    scanColumns(bounds, {
      columns: [true, false, false, false, false],
      down: false,
    })
  )
  const minAspectRatio = aspectRatio - aspectRatioTolerance
  const maxAspectRatio = aspectRatio + aspectRatioTolerance

  while (true) {
    const next =
      typeof nextY === 'number'
        ? shapeIterator.next(nextY)
        : shapeIterator.next()

    if (next.done) {
      break
    }

    const shape = next.value
    const actualAspectRatio = shape.bounds.width / shape.bounds.height

    if (
      minAspectRatio <= actualAspectRatio &&
      actualAspectRatio <= maxAspectRatio
    ) {
      yield shape
      nextY = shape.bounds.y - 1
    } else {
      nextY = undefined
    }
  }
}
