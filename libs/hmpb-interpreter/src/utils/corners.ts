import makeDebug from 'debug'
import { Edge, Shape } from '../hmpb/shapes'
import { Corners, Point } from '../types'
import { editDistance, rectCorners } from './geometry'

const debug = makeDebug('module-scan:corners')

const MIN_INSET_PIXELS = 10
const MEDIAN_INSET_MULTIPLIER = 2.5

function findTopLeftCorner(
  topLeft: Point,
  leftMedian: number,
  topMedian: number,
  leftEdge: Edge,
  topEdge: Edge,
  maxUpDownSkewDistance: number,
  maxLeftRightSkewDistance: number
): Point {
  debug('finding top-left corner from %o', topLeft)
  let bestDistance = Infinity
  let bestPoints: Point[] = []

  for (
    let x = topLeft.x,
      xInset = Math.max(
        MEDIAN_INSET_MULTIPLIER * Math.abs(leftMedian - topLeft.x),
        MIN_INSET_PIXELS
      );
    x <= topLeft.x + xInset;
    x++
  ) {
    const y = topEdge[x]

    if (Math.abs(y - topLeft.y) > maxUpDownSkewDistance) {
      continue
    }

    const newDistance = editDistance({ x, y }, topLeft)
    if (newDistance < bestDistance) {
      bestPoints = [{ x, y }]
      bestDistance = newDistance
    } else if (newDistance === bestDistance) {
      bestPoints.push({ x, y })
    }
  }

  for (
    let y = topLeft.y,
      yInset = Math.max(
        MEDIAN_INSET_MULTIPLIER * Math.abs(topMedian - topLeft.y),
        MIN_INSET_PIXELS
      );
    y <= topLeft.y + yInset;
    y++
  ) {
    const x = leftEdge[y]

    if (Math.abs(x - topLeft.x) > maxLeftRightSkewDistance) {
      continue
    }

    const newDistance = editDistance({ x, y }, topLeft)
    if (newDistance < bestDistance) {
      bestPoints = [{ x, y }]
      bestDistance = newDistance
    } else if (newDistance === bestDistance) {
      bestPoints.push({ x, y })
    }
  }

  debug('found top-left corner candidates: %o', bestPoints)

  if (bestPoints.length === 0) {
    debug('found no points!? falling back to top-left: %o', topLeft)
    return topLeft
  }

  const bestPoint = {
    x: Math.min(...bestPoints.map(({ x }) => x)),
    y: Math.min(...bestPoints.map(({ y }) => y)),
  }
  debug('merging top-left corner candidates: %o', bestPoint)
  return bestPoint
}

function findTopRightCorner(
  topRight: Point,
  rightMedian: number,
  topMedian: number,
  rightEdge: Edge,
  topEdge: Edge,
  maxUpDownSkewDistance: number,
  maxLeftRightSkewDistance: number
): Point {
  debug('finding top-right corner from %o', topRight)
  let bestDistance = Infinity
  let bestPoints: Point[] = []

  for (
    let x = topRight.x,
      xInset = Math.max(
        MEDIAN_INSET_MULTIPLIER * Math.abs(rightMedian - topRight.x),
        MIN_INSET_PIXELS
      );
    x >= topRight.x - xInset;
    x--
  ) {
    const y = topEdge[x]

    if (Math.abs(y - topRight.y) > maxUpDownSkewDistance) {
      continue
    }

    const newDistance = editDistance({ x, y }, topRight)

    if (newDistance < bestDistance) {
      bestPoints = [{ x, y }]
      bestDistance = newDistance
    } else if (newDistance === bestDistance) {
      bestPoints.push({ x, y })
    }
  }

  for (
    let y = topRight.y,
      yInset = Math.max(
        MEDIAN_INSET_MULTIPLIER * Math.abs(topMedian - topRight.y),
        MIN_INSET_PIXELS
      );
    y <= topRight.y + yInset;
    y++
  ) {
    const x = rightEdge[y]

    if (x - topRight.x > maxLeftRightSkewDistance) {
      continue
    }

    const newDistance = editDistance({ x, y }, topRight)

    if (newDistance < bestDistance) {
      bestPoints = [{ x, y }]
      bestDistance = newDistance
    } else if (newDistance === bestDistance) {
      bestPoints.push({ x, y })
    }
  }

  debug('found top-right corner candidates: %o', bestPoints)

  if (bestPoints.length === 0) {
    debug('found no points!? falling back to top-right: %o', topRight)
    return topRight
  }

  const bestPoint = {
    x: Math.max(...bestPoints.map(({ x }) => x)),
    y: Math.min(...bestPoints.map(({ y }) => y)),
  }
  debug('merging top-right corner candidates: %o', bestPoint)
  return bestPoint
}

function findBottomLeftCorner(
  bottomLeft: Point,
  leftMedian: number,
  bottomMedian: number,
  leftEdge: Edge,
  bottomEdge: Edge,
  maxUpDownSkewDistance: number,
  maxLeftRightSkewDistance: number
): Point {
  debug('finding bottom-left corner from %o', bottomLeft)
  let bestDistance = Infinity
  let bestPoints: Point[] = []

  for (
    let x = bottomLeft.x,
      xInset = Math.max(
        MEDIAN_INSET_MULTIPLIER * Math.abs(leftMedian - bottomLeft.x),
        MIN_INSET_PIXELS
      );
    x <= bottomLeft.x + xInset;
    x++
  ) {
    const y = bottomEdge[x]

    if (Math.abs(y - bottomLeft.y) > maxUpDownSkewDistance) {
      continue
    }

    const newDistance = editDistance({ x, y }, bottomLeft)
    if (newDistance < bestDistance) {
      bestPoints = [{ x, y }]
      bestDistance = newDistance
    } else if (newDistance === bestDistance) {
      bestPoints.push({ x, y })
    }
  }

  for (
    let y = bottomLeft.y,
      yInset = Math.max(
        MEDIAN_INSET_MULTIPLIER * Math.abs(bottomMedian - bottomLeft.y),
        MIN_INSET_PIXELS
      );
    y >= bottomLeft.y - yInset;
    y--
  ) {
    const x = leftEdge[y]

    if (Math.abs(x - bottomLeft.x) > maxLeftRightSkewDistance) {
      continue
    }

    const newDistance = editDistance({ x, y }, bottomLeft)
    if (newDistance < bestDistance) {
      bestPoints = [{ x, y }]
      bestDistance = newDistance
    } else if (newDistance === bestDistance) {
      bestPoints.push({ x, y })
    }
  }

  debug('found bottom-left corner candidates: %o', bestPoints)
  if (bestPoints.length === 0) {
    debug('found no points!? falling back to bottom-left: %o', bottomLeft)
    return bottomLeft
  }

  const bestPoint = {
    x: Math.min(...bestPoints.map(({ x }) => x)),
    y: Math.max(...bestPoints.map(({ y }) => y)),
  }
  debug('merging bottom-left corner candidates: %o', bestPoint)
  return bestPoint
}

function findBottomRightCorner(
  bottomRight: Point,
  rightMedian: number,
  bottomMedian: number,
  rightEdge: Edge,
  bottomEdge: Edge,
  maxUpDownSkewDistance: number,
  maxLeftRightSkewDistance: number
): Point {
  debug('finding bottom-right corner from %o', bottomRight)
  let bestDistance = Infinity
  let bestPoints: Point[] = []

  for (
    let x = bottomRight.x,
      xInset = Math.max(
        MEDIAN_INSET_MULTIPLIER * Math.abs(rightMedian - bottomRight.x),
        MIN_INSET_PIXELS
      );
    x >= bottomRight.x - xInset;
    x--
  ) {
    const y = bottomEdge[x]

    if (Math.abs(y - bottomRight.y) > maxUpDownSkewDistance) {
      continue
    }

    const newDistance = editDistance({ x, y }, bottomRight)
    if (newDistance < bestDistance) {
      bestPoints = [{ x, y }]
      bestDistance = newDistance
    } else if (newDistance === bestDistance) {
      bestPoints.push({ x, y })
    }
  }

  for (
    let y = bottomRight.y,
      yInset = Math.max(
        MEDIAN_INSET_MULTIPLIER * Math.abs(bottomMedian - bottomRight.y),
        MIN_INSET_PIXELS
      );
    y >= bottomRight.y - yInset;
    y--
  ) {
    const x = rightEdge[y]

    if (x - bottomRight.x > maxLeftRightSkewDistance) {
      continue
    }

    const newDistance = editDistance({ x, y }, bottomRight)
    if (newDistance < bestDistance) {
      bestPoints = [{ x, y }]
      bestDistance = newDistance
    } else if (newDistance === bestDistance) {
      bestPoints.push({ x, y })
    }
  }

  debug('found bottom-right corner candidates: %o', bestPoints)

  if (bestPoints.length === 0) {
    debug('found no points!? falling back to top-left: %o', bottomRight)
    return bottomRight
  }

  const bestPoint = {
    x: Math.max(...bestPoints.map(({ x }) => x)),
    y: Math.max(...bestPoints.map(({ y }) => y)),
  }
  debug('merging bottom-right corner candidates: %o', bestPoint)
  return bestPoint
}

export function getCorners(
  shape: Shape,
  { maxSkewRadians = (5 / 180) * Math.PI } = {}
): Corners {
  debug(
    'finding corners of shape with bounds (%o); maxSkew=%d°',
    shape.bounds,
    (maxSkewRadians * 180) / Math.PI
  )
  const { bounds, edges } = shape
  const [
    boundsTopLeft,
    boundsTopRight,
    boundsBottomLeft,
    boundsBottomRight,
  ] = rectCorners(bounds)
  const maxLeftRightSkewDistance = Math.ceil(
    bounds.height * Math.tan(maxSkewRadians)
  )
  const maxUpDownSkewDistance = Math.ceil(
    bounds.width * Math.tan(maxSkewRadians)
  )

  const { leftMedian, rightMedian, topMedian, bottomMedian } = edges

  debug(
    'calculated max left/right skew distance: %dpx',
    maxLeftRightSkewDistance
  )
  debug('calculated max up/down skew distance: %dpx', maxUpDownSkewDistance)

  const topLeftCorner = findTopLeftCorner(
    boundsTopLeft,
    leftMedian,
    topMedian,
    edges.left,
    edges.top,
    maxUpDownSkewDistance,
    maxLeftRightSkewDistance
  )

  const topRightCorner = findTopRightCorner(
    boundsTopRight,
    rightMedian,
    topMedian,
    edges.right,
    edges.top,
    maxUpDownSkewDistance,
    maxLeftRightSkewDistance
  )

  const bottomLeftCorner = findBottomLeftCorner(
    boundsBottomLeft,
    leftMedian,
    bottomMedian,
    edges.left,
    edges.bottom,
    maxUpDownSkewDistance,
    maxLeftRightSkewDistance
  )

  const bottomRightCorner = findBottomRightCorner(
    boundsBottomRight,
    rightMedian,
    bottomMedian,
    edges.right,
    edges.bottom,
    maxUpDownSkewDistance,
    maxLeftRightSkewDistance
  )

  return [topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner]
}
