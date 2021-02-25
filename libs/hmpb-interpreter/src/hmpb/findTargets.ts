import makeDebug from 'debug'
import { Rect } from '../types'
import { PIXEL_WHITE } from '../utils/binarize'
import { rectCenter } from '../utils/geometry'
import { VisitedPoints } from '../utils/VisitedPoints'
import { findShape, Shape } from './shapes'

const debug = makeDebug('hmpb-interpreter:findTargets')

export interface TargetShape {
  bounds: Rect
  inner: Rect
}

export default function* findTargets(
  ballotImage: ImageData,
  bounds: Rect,
  {
    inset = Math.round(0.0175 * ballotImage.width),
    aspectRatio = 1.5,
    aspectRatioTolerance = 0.1,
    expectedWidth = Math.round(0.025 * ballotImage.width),
    errorMargin = Math.ceil(0.04 * expectedWidth),
  } = {}
): Generator<TargetShape> {
  debug('finding targets in %o', bounds)
  const visitedPoints = new VisitedPoints(ballotImage.width, ballotImage.height)
  const minAspectRatio = aspectRatio - aspectRatioTolerance
  const maxAspectRatio = aspectRatio + aspectRatioTolerance

  const x = bounds.x + Math.round(inset + expectedWidth / 2)
  let lastShape: Shape | undefined

  for (let y = bounds.y + bounds.height - inset; y > bounds.y; y--) {
    const shape = findShape(ballotImage, { x, y }, visitedPoints)

    if (shape.bounds.width <= 1 || shape.bounds.height <= 1) {
      continue
    }

    // If we already found one, so let's use it to determine the right size.
    let found: boolean

    if (lastShape) {
      if (
        shape.bounds.width <= lastShape.bounds.width + errorMargin &&
        shape.bounds.width >= lastShape.bounds.width - errorMargin &&
        shape.bounds.height <= lastShape.bounds.height + errorMargin &&
        shape.bounds.height >= lastShape.bounds.height - errorMargin
      ) {
        debug('shape matches last target shape!')
        found = true
      } else {
        debug(
          'skipping shape because it does not match the last known target shape: %O ≉ %O',
          shape.bounds,
          lastShape.bounds
        )
        found = false
      }
    } else {
      const actualAspectRatio = shape.bounds.width / shape.bounds.height
      if (
        actualAspectRatio < minAspectRatio ||
        actualAspectRatio > maxAspectRatio
      ) {
        debug(
          'skipping shape because it is the wrong aspect ratio: %d ≉ %d ± %d: %O',
          actualAspectRatio,
          aspectRatio,
          aspectRatioTolerance,
          shape.bounds
        )
        found = false
      } else if (
        shape.bounds.width < expectedWidth - errorMargin ||
        shape.bounds.width > expectedWidth + errorMargin
      ) {
        debug(
          'skipping shape because it is the wrong width: %d ≉ %d ± %d: %O',
          shape.bounds.width,
          expectedWidth,
          errorMargin,
          shape.bounds
        )
        found = false
      } else {
        found = true
      }
    }

    if (found) {
      debug('found shape: %O', shape.bounds)
      const innerShape = findShape(
        ballotImage,
        rectCenter(shape.bounds, { round: true }),
        undefined,
        { color: PIXEL_WHITE }
      )
      lastShape = shape
      yield {
        bounds: shape.bounds,
        inner: innerShape.bounds,
      }
    }

    y = shape.bounds.y
  }
}
