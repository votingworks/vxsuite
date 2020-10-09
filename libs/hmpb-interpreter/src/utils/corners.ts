import { strict as assert } from 'assert'
import makeDebug from 'debug'
import { Shape } from '../hmpb/shapes'
import { Corners, Offset, Point } from '../types'
import { PIXEL_BLACK } from './binarize'
import { rectCorners } from './geometry'
import { getImageChannelCount } from './imageFormatUtils'

const debug = makeDebug('module-scan:corners')

export function getCorners(
  imageData: ImageData,
  shape: Shape,
  { minLineStroke = 2, maxSkewRadians = (5 / 180) * Math.PI } = {}
): Corners {
  debug(
    'finding corners of shape with bounds (%o); minLineStroke=%d maxSkew=%d°',
    shape.bounds,
    minLineStroke,
    maxSkewRadians,
    (maxSkewRadians * 180) / Math.PI
  )
  const [topLeft, topRight, bottomLeft, bottomRight] = rectCorners(shape.bounds)
  const maxLeftRightSkewDistance = Math.ceil(
    shape.bounds.height * Math.tan(maxSkewRadians)
  )
  const maxUpDownSkewDistance = Math.ceil(
    shape.bounds.width * Math.tan(maxSkewRadians)
  )

  debug(
    'calculated max left/right skew distance: %dpx',
    maxLeftRightSkewDistance
  )
  debug('calculated max up/down skew distance: %dpx', maxUpDownSkewDistance)

  debug('finding top-left corner from %o', topLeft)
  const topLeftCorner = findCorner(
    imageData,
    topLeft,
    { x: 1, y: 1 },
    {
      minLineStroke: minLineStroke,
      maxOffset: { x: maxLeftRightSkewDistance, y: maxUpDownSkewDistance },
    }
  )
  debug('found top-left corner: %o', topLeftCorner)

  debug('finding top-right corner from %o', topRight)
  const topRightCorner = findCorner(
    imageData,
    topRight,
    { x: -1, y: 1 },
    {
      minLineStroke: minLineStroke,
      maxOffset: { x: -maxLeftRightSkewDistance, y: maxUpDownSkewDistance },
    }
  )
  debug('found top-right corner: %o', topRightCorner)

  debug('finding bottom-left corner from %o', bottomLeft)
  const bottomLeftCorner = findCorner(
    imageData,
    bottomLeft,
    { x: 1, y: -1 },
    {
      minLineStroke: minLineStroke,
      maxOffset: { x: maxLeftRightSkewDistance, y: -maxUpDownSkewDistance },
    }
  )
  debug('found bottom-left corner: %o', bottomLeftCorner)

  debug('finding bottom-right corner from %o', bottomRight)
  const bottomRightCorner = findCorner(
    imageData,
    bottomRight,
    { x: -1, y: -1 },
    {
      minLineStroke: minLineStroke,
      maxOffset: { x: -maxLeftRightSkewDistance, y: -maxUpDownSkewDistance },
    }
  )
  debug('found bottom-right corner: %o', bottomRightCorner)

  return [topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner]
}

export function findCorner(
  { data, width, height }: ImageData,
  { x: startX, y: startY }: Point,
  stepOffset: Offset,
  { minLineStroke, maxOffset }: { minLineStroke: number; maxOffset: Offset }
): Point {
  assert(minLineStroke > 0)

  const channels = getImageChannelCount({ data, width, height })

  for (let step = 0; ; step += 1) {
    const stepOffsetX = step * stepOffset.x
    const stepOffsetY = step * stepOffset.y
    const inBoundsX = Math.abs(stepOffsetX) <= Math.abs(maxOffset.x)
    const inBoundsY = Math.abs(stepOffsetY) <= Math.abs(maxOffset.y)

    if (!inBoundsX && !inBoundsY) {
      debug(
        'offset (%o) passed max offset (%o), reverting to starting point as the corner',
        { x: stepOffsetX, y: stepOffsetY },
        maxOffset
      )
      return { x: startX, y: startY }
    }

    if (inBoundsX) {
      const x = startX + stepOffsetX
      const y = startY
      let found = true

      debug(
        'checking for %d black pixel(s) in the x direction starting at x=%d, y=%d',
        minLineStroke,
        x,
        y
      )
      for (let strokeOffset = 0; strokeOffset < minLineStroke; strokeOffset++) {
        if (
          data[
            (y * width + x + strokeOffset * Math.sign(stepOffsetX)) * channels
          ] !== PIXEL_BLACK
        ) {
          debug('bailing at stroke offset %d', strokeOffset)
          found = false
          break
        }
      }

      if (found) {
        debug(
          'found corner at x=%d, y=%d after %d step(s) in the x direction',
          x,
          y,
          step
        )
        return { x, y }
      }
    }

    if (inBoundsY) {
      const x = startX
      const y = startY + stepOffsetY
      let found = true

      debug(
        'checking for %d black pixel(s) in the y direction starting at x=%d, y=%d',
        minLineStroke,
        x,
        y
      )
      for (let strokeOffset = 0; strokeOffset < minLineStroke; strokeOffset++) {
        if (
          data[
            ((y + strokeOffset * Math.sign(stepOffsetY)) * width + x) * channels
          ] !== PIXEL_BLACK
        ) {
          debug('bailing at stroke offset %d', strokeOffset)
          found = false
          break
        }
      }

      if (found) {
        debug(
          'found corner at x=%d, y=%d after %d step(s) in the y direction',
          x,
          y,
          step
        )
        return { x, y }
      }
    }
  }
}
