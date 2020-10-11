import makeDebug from 'debug'
import { Shape } from '../hmpb/shapes'
import { Corners, Offset, Point, Rect } from '../types'
import { PIXEL_BLACK } from './binarize'
import { rectCorners } from './geometry'
import { getImageChannelCount } from './imageFormatUtils'

const debug = makeDebug('module-scan:corners')

export function getCorners(
  imageData: ImageData,
  shape: Shape,
  { maxSkewRadians = (5 / 180) * Math.PI } = {}
): Corners {
  debug(
    'finding corners of shape with bounds (%o); maxSkew=%d°',
    shape.bounds,
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
  const topLeftCorner = findCorner(imageData, {
    bounds: shape.bounds,
    startAt: topLeft,
    stepOffset: { x: 1, y: 1 },
    maxOffset: { x: maxLeftRightSkewDistance, y: maxUpDownSkewDistance },
  })
  debug('found top-left corner: %o', topLeftCorner)

  debug('finding top-right corner from %o', topRight)
  const topRightCorner = findCorner(imageData, {
    bounds: shape.bounds,
    startAt: topRight,
    stepOffset: { x: -1, y: 1 },
    maxOffset: { x: -maxLeftRightSkewDistance, y: maxUpDownSkewDistance },
  })
  debug('found top-right corner: %o', topRightCorner)

  debug('finding bottom-left corner from %o', bottomLeft)
  const bottomLeftCorner = findCorner(imageData, {
    bounds: shape.bounds,
    startAt: bottomLeft,
    stepOffset: { x: 1, y: -1 },
    maxOffset: { x: maxLeftRightSkewDistance, y: -maxUpDownSkewDistance },
  })
  debug('found bottom-left corner: %o', bottomLeftCorner)

  debug('finding bottom-right corner from %o', bottomRight)
  const bottomRightCorner = findCorner(imageData, {
    bounds: shape.bounds,
    startAt: bottomRight,
    stepOffset: { x: -1, y: -1 },
    maxOffset: { x: -maxLeftRightSkewDistance, y: -maxUpDownSkewDistance },
  })
  debug('found bottom-right corner: %o', bottomRightCorner)

  return [topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner]
}

export function findCorner(
  { data, width, height }: ImageData,
  {
    bounds,
    startAt: { x: startX, y: startY },
    stepOffset,
    maxOffset,
  }: { bounds: Rect; startAt: Point; stepOffset: Offset; maxOffset: Offset }
): Point {
  const channels = getImageChannelCount({ data, width, height })
  let checkingX = true
  let checkingY = true

  for (let step = 0; ; step += 1) {
    const stepOffsetX = step * stepOffset.x
    const stepOffsetY = step * stepOffset.y

    if (!checkingX && !checkingY) {
      debug(
        'unable to find a suitable corner in either direction, even after backtracking; using the original bounding box corner'
      )
      return { x: startX, y: startY }
    }

    if (
      checkingX &&
      startX + stepOffsetX >= bounds.x &&
      startX + stepOffsetX < bounds.x + bounds.width
    ) {
      let x = startX + stepOffsetX
      let y = startY

      debug('checking for a black pixel in the x direction at x=%d, y=%d', x, y)
      if (data[(y * width + x) * channels] === PIXEL_BLACK) {
        debug(
          'found possible corner at x=%d, y=%d after %d step(s) in the x direction',
          x,
          y,
          step
        )

        while (
          data[((y + stepOffset.y) * width + (x - stepOffset.x)) * channels] ===
          PIXEL_BLACK
        ) {
          y += stepOffset.y
          x -= stepOffset.x
          debug(
            'backtracking to x=%d, y=%d to correct a possible overshoot',
            x,
            y
          )

          while (
            x >= bounds.x &&
            x < bounds.x + bounds.width &&
            data[(y * width + (x - stepOffset.x)) * channels] === PIXEL_BLACK
          ) {
            x -= stepOffset.x
          }
          debug('backtracked in the x direction to x=%d, y=%d', x, y)
        }

        debug(
          'backtracked in the x direction as far as possible, now going in the y direction'
        )
        while (
          y >= bounds.y &&
          y < bounds.y + bounds.height &&
          data[((y - stepOffset.y) * width + x) * channels] === PIXEL_BLACK
        ) {
          debug('backtracking along the y direction to x=%d, y=%d', x, y)
          y -= stepOffset.y
        }

        if (Math.abs(startX - x) > Math.abs(maxOffset.x)) {
          debug(
            'after backtracking, skew would still be too high; done checking in the x direction'
          )
          checkingX = false
        } else {
          debug('final corner detected at x=%d, y=%d', x, y)
          return { x, y }
        }
      }
    }

    if (
      checkingY &&
      startY + stepOffsetY >= bounds.y &&
      startY + stepOffsetY < bounds.y + bounds.height
    ) {
      let x = startX
      let y = startY + stepOffsetY

      debug('checking for a black pixel in the y direction at x=%d, y=%d', x, y)
      if (data[(y * width + x) * channels] === PIXEL_BLACK) {
        debug(
          'found possible corner at x=%d, y=%d after %d step(s) in the y direction',
          x,
          y,
          step
        )

        while (
          data[((y - stepOffset.y) * width + (x + stepOffset.x)) * channels] ===
          PIXEL_BLACK
        ) {
          y -= stepOffset.y
          x += stepOffset.x
          debug(
            'backtracking to x=%d, y=%d to correct a possible overshoot',
            x,
            y
          )

          while (
            y >= bounds.y &&
            y < bounds.y + bounds.height &&
            data[((y - stepOffset.y) * width + x) * channels] === PIXEL_BLACK
          ) {
            y -= stepOffset.y
          }
          debug('backtracked in the y direction to x=%d, y=%d', x, y)
        }

        debug(
          'backtracked in the y direction as far as possible, now going in the x direction'
        )
        while (
          x >= bounds.x &&
          x < bounds.x + bounds.width &&
          data[(y * width + (x - stepOffset.x)) * channels] === PIXEL_BLACK
        ) {
          debug('backtracking along the x direction to x=%d, y=%d', x, y)
          x -= stepOffset.x
        }

        if (Math.abs(startY - y) > Math.abs(maxOffset.y)) {
          debug(
            'after backtracking, skew would still be too high; done checking in the y direction'
          )
          checkingY = false
        } else {
          debug('final corner detected at x=%d, y=%d', x, y)
          return { x, y }
        }
      }
    }
  }
}
