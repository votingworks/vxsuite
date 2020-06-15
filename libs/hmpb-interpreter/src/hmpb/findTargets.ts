import { Rect } from '../types'
import { PIXEL_WHITE } from '../utils/binarize'
import { rectCenter } from '../utils/geometry'
import scanColumns from './scanColumns'
import { findShape, findShapes } from './shapes'
import makeDebug from 'debug'

const debug = makeDebug('hmpb-interpreter:findTargets')

export interface TargetShape {
  bounds: Rect
  inner: Rect
}

export default function* findTargets(
  ballotImage: ImageData,
  bounds: Rect,
  {
    aspectRatio = 1.5,
    aspectRatioTolerance = 0.1,
    widthPercentage = 0.085,
    widthPercentageTolerance = 0.005,
  } = {}
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
  const minWidth = (widthPercentage - widthPercentageTolerance) * bounds.width
  const maxWidth = (widthPercentage + widthPercentageTolerance) * bounds.width

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
      const actualWidth = shape.bounds.width

      if (minWidth <= actualWidth && actualWidth <= maxWidth) {
        debug(
          'found shape with aspect ratio %d and width %d within expected values: %O',
          actualAspectRatio,
          actualWidth,
          shape.bounds
        )
        yield {
          bounds: shape.bounds,
          inner: innerShape.bounds,
        }
        nextY = shape.bounds.y - 1
      } else {
        debug(
          'skipping shape because it does not have the right width: %d ± %d (expected) ≠ %d (actual width)',
          widthPercentage * bounds.width,
          widthPercentageTolerance * bounds.width,
          actualWidth
        )
        nextY = undefined
      }
    } else {
      if (!isNaN(actualAspectRatio)) {
        debug(
          'skipping shape because it does not have the right aspect ratio: %d ± %d (expected) ≠ %d',
          aspectRatio,
          aspectRatioTolerance,
          actualAspectRatio
        )
      }
      nextY = undefined
    }
  }
}
