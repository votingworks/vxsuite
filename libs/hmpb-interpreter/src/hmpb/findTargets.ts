import makeDebug from 'debug'
import { Rect } from '../types'
import { PIXEL_WHITE } from '../utils/binarize'
import { rectCenter } from '../utils/geometry'
import { VisitedPoints } from '../utils/VisitedPoints'
import { findShape } from './shapes'

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
    errorMargin = Math.ceil(0.02 * expectedWidth),
  } = {}
): Generator<TargetShape> {
  const visitedPoints = new VisitedPoints(ballotImage.width, ballotImage.height)
  const minAspectRatio = aspectRatio - aspectRatioTolerance
  const maxAspectRatio = aspectRatio + aspectRatioTolerance

  const x = bounds.x + Math.round(inset + expectedWidth / 2)

  for (let y = bounds.y + bounds.height - inset; y > bounds.y; y--) {
    const shape = findShape(ballotImage, { x, y }, visitedPoints)

    if (shape.bounds.width === 0 || shape.bounds.height === 0) {
      continue
    }

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
    } else {
      debug('found shape: %O', shape.bounds)
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
    }

    y = shape.bounds.y
  }
}
