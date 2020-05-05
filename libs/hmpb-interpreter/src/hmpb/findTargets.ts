import { Rect } from '../types'
import { PIXEL_WHITE } from '../utils/binarize'
import { rectCenter } from '../utils/geometry'
import scanColumns from './scanColumns'
import { findShape, findShapes } from './shapes'

export interface TargetShape {
  bounds: Rect
  inner: Rect
}

export default function* findTargets(
  ballotImage: ImageData,
  bounds: Rect,
  { aspectRatio = 1.5, aspectRatioTolerance = 0.1 } = {}
): Generator<TargetShape> {
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
      const innerShape = findShape(
        ballotImage,
        rectCenter(shape.bounds, { round: true }),
        undefined,
        { color: PIXEL_WHITE }
      )
      yield {
        bounds: shape.bounds,
        inner: innerShape.bounds,
      }
      nextY = shape.bounds.y - 1
    } else {
      nextY = undefined
    }
  }
}
