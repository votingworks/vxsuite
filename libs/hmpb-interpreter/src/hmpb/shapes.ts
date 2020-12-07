import { strict as assert } from 'assert'
import { Corners, Point, Rect, Vector } from '../types'
import { PIXEL_BLACK } from '../utils/binarize'
import {
  angleBetweenPoints,
  mergeRects,
  rectContains,
  rectShift,
  roundPoint,
} from '../utils/geometry'
import { getImageChannelCount } from '../utils/imageFormatUtils'
import { VisitedPoints } from '../utils/VisitedPoints'

export type Edge = Int32Array

export interface Edges {
  top: Edge
  right: Edge
  bottom: Edge
  left: Edge
}

export interface Shape {
  bounds: Rect
  edges: Edges
}

export function* getMatchingPoints(
  imageData: ImageData,
  rect: Rect,
  color: number
): Generator<Point> {
  const { data, width } = imageData
  const channels = getImageChannelCount(imageData)

  for (let x = rect.x; x < rect.x + rect.width; x++) {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      if (data[channels * (x + y * width)] === color) {
        yield { x, y }
      }
    }
  }
}

export function computeAreaFill(imageData: ImageData, rect: Rect): number {
  let result = 0

  for (const _ of getMatchingPoints(imageData, rect, PIXEL_BLACK)) {
    result++
  }

  return result
}

function computeAverageY(
  imageData: ImageData,
  rect: Rect,
  color: number
): number {
  const ys = [...getMatchingPoints(imageData, rect, color)]
  return ys.reduce((sum, { y }) => sum + y, 0) / ys.length
}

function computeAverageX(
  imageData: ImageData,
  rect: Rect,
  color: number
): number {
  const xs = [...getMatchingPoints(imageData, rect, color)]
  return xs.reduce((sum, { x }) => sum + x, 0) / xs.length
}

export function lineSegmentEndpoints({
  imageData,
  lineSegmentBounds,
  color,
}: {
  imageData: ImageData
  lineSegmentBounds: Rect
  color: number
}): [Point, Point] {
  if (lineSegmentBounds.width > lineSegmentBounds.height) {
    const midX = Math.round(lineSegmentBounds.x + lineSegmentBounds.width / 2)
    const leftMidX = Math.round((lineSegmentBounds.x + midX) / 2)
    const rightMidX = Math.round(
      lineSegmentBounds.x + (lineSegmentBounds.width * 3) / 4
    )
    const leftAverageY = computeAverageY(
      imageData,
      {
        x: lineSegmentBounds.x,
        y: lineSegmentBounds.y,
        width: midX - lineSegmentBounds.x,
        height: lineSegmentBounds.height,
      },
      color
    )
    const rightAverageY = computeAverageY(
      imageData,
      {
        x: midX,
        y: lineSegmentBounds.y,
        width: lineSegmentBounds.x + lineSegmentBounds.width - midX,
        height: lineSegmentBounds.height,
      },
      color
    )

    // console.log({ midX, leftMidX, rightMidX, leftAverageY, rightAverageY })
    return [
      roundPoint({ x: leftMidX, y: leftAverageY }),
      roundPoint({ x: rightMidX, y: rightAverageY }),
    ]
  } else {
    const midY = Math.round(lineSegmentBounds.y + lineSegmentBounds.height / 2)
    const leftMidY = Math.round(midY / 2)
    const rightMidY = Math.round(
      lineSegmentBounds.y + lineSegmentBounds.height / 2
    )
    const topAverageX = computeAverageX(
      imageData,
      {
        x: lineSegmentBounds.x,
        y: lineSegmentBounds.y,
        width: lineSegmentBounds.width,
        height: midY - lineSegmentBounds.y,
      },
      color
    )
    const bottomAverageX = computeAverageY(
      imageData,
      {
        x: lineSegmentBounds.x,
        y: midY,
        width: lineSegmentBounds.width,
        height: lineSegmentBounds.y + lineSegmentBounds.height - midY,
      },
      color
    )

    return [
      { x: topAverageX, y: leftMidY },
      { x: bottomAverageX, y: rightMidY },
    ]
  }
}

export function expandLineSegment({
  imageData,
  lineSegmentBounds,
  direction,
  bounds,
  color,
}: {
  imageData: ImageData
  lineSegmentBounds: Rect
  bounds: Rect
  direction: Vector
  color: number
}): Rect {
  assert((direction.x === 0) !== (direction.y === 0))
  const minimumContrastRatio = 0.2
  const blockSize = Math.abs(direction.x + direction.y)

  const [start, end] = lineSegmentEndpoints({
    imageData,
    lineSegmentBounds,
    color,
  })
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const xDistance = blockSize * Math.cos(angle)
  const yDistance = blockSize * Math.sin(angle)
  console.log({ start, end, angle, xDistance, yDistance })
  const areaToCheck: Rect = {
    x:
      direction.x === 0
        ? lineSegmentBounds.x
        : direction.x < 0
        ? lineSegmentBounds.x + direction.x
        : lineSegmentBounds.x + lineSegmentBounds.width,
    y:
      direction.y === 0
        ? lineSegmentBounds.y
        : direction.y < 0
        ? lineSegmentBounds.y + direction.y
        : lineSegmentBounds.y + lineSegmentBounds.height,
    width: direction.x === 0 ? lineSegmentBounds.width : blockSize,
    height: direction.y === 0 ? lineSegmentBounds.height : blockSize,
  }

  if (!rectContains(bounds, areaToCheck)) {
    return lineSegmentBounds
  }

  const areaToCheckSide1 = rectShift(areaToCheck, {
    x: direction.y,
    y: direction.x,
  })

  const areaToCheckSide2 = rectShift(areaToCheck, {
    x: -direction.y,
    y: -direction.x,
  })

  if (
    !rectContains(bounds, areaToCheckSide1) ||
    !rectContains(bounds, areaToCheckSide2)
  ) {
    return lineSegmentBounds
  }

  const areaToCheckFill = computeAreaFill(imageData, areaToCheck)
  const areaToCheckSide1Fill = computeAreaFill(imageData, areaToCheckSide1)
  const areaToCheckSide2Fill = computeAreaFill(imageData, areaToCheckSide2)

  if (areaToCheckFill === 0) {
    // nothing filled in within the block
    return lineSegmentBounds
  }

  const side1ContrastRatio = areaToCheckSide1Fill / areaToCheckFill
  const side2ContrastRatio = areaToCheckSide2Fill / areaToCheckFill

  if (
    side1ContrastRatio < minimumContrastRatio ||
    side2ContrastRatio < minimumContrastRatio
  ) {
    // contrast is too low
    return lineSegmentBounds
  }

  return expandLineSegment({
    imageData,
    lineSegmentBounds: mergeRects(lineSegmentBounds, areaToCheck),
    bounds,
    direction,
    color,
  })
}

/**
 * Finds a shape in a binarized image by looking for adjacent pixels of a
 * specific color starting at a given point.
 */
export function findShape(
  imageData: ImageData,
  startingPoint: Point,
  visitedPoints = new VisitedPoints(imageData.width, imageData.height),
  { color = PIXEL_BLACK } = {}
): Shape {
  const toVisit: Point[] = [startingPoint]
  const points = new VisitedPoints(imageData.width, imageData.height)
  const { data, width, height } = imageData
  const channel = getImageChannelCount(imageData)

  const topEdge = new Int32Array(imageData.width).fill(imageData.height)
  const rightEdge = new Int32Array(imageData.height).fill(-1)
  const bottomEdge = new Int32Array(imageData.width).fill(-1)
  const leftBorder = new Int32Array(imageData.height).fill(imageData.width)
  let xMin = startingPoint.x
  let yMin = startingPoint.y
  let xMax = startingPoint.x
  let yMax = startingPoint.y

  for (let point: Point | undefined; (point = toVisit.shift()); point) {
    const { x, y } = point

    if (!visitedPoints.add(x, y)) {
      continue
    }

    const index = (x + y * width) * channel
    const isForeground = data[index] === color
    points.add(x, y, isForeground)

    if (isForeground) {
      if (x < xMin) {
        xMin = x
      }
      if (y < yMin) {
        yMin = y
      }
      if (x > xMax) {
        xMax = x
      }
      if (y > yMax) {
        yMax = y
      }
      if (x < leftBorder[y]) {
        leftBorder[y] = x
      }
      if (y < topEdge[x]) {
        topEdge[x] = y
      }
      if (x > rightEdge[y]) {
        rightEdge[y] = x
      }
      if (y > bottomEdge[x]) {
        bottomEdge[x] = y
      }

      for (const xD of [-1, 0, 1]) {
        for (const yD of [-1, 0, 1]) {
          const nextX = x + xD
          const nextY = y + yD

          if (
            nextX > 0 &&
            nextY > 0 &&
            nextX < width &&
            nextY < height &&
            !points.has(nextX, nextY)
          ) {
            toVisit.push({ x: nextX, y: nextY })
          }
        }
      }
    }
  }

  return {
    bounds: {
      x: xMin,
      y: yMin,
      width: xMax - xMin + 1,
      height: yMax - yMin + 1,
    },
    edges: {
      top: topEdge,
      right: rightEdge,
      bottom: bottomEdge,
      left: leftBorder,
    },
  }
}

export interface ParseRectangleResult {
  isRectangle: boolean
  angles: [number, number, number, number]
}

/**
 * Determines whether the given corners make for a roughly rectangular shape.
 * The amount of allowed error can be controlled.
 *
 * @param corners the corners to check
 * @param param1.allowedErrorAngle the angle in radians to allow in error
 */
export function parseRectangle(
  corners: Corners,
  { allowedErrorAngle = (5 / 180) * Math.PI } = {}
): ParseRectangleResult {
  const [topLeft, topRight, bottomLeft, bottomRight] = corners
  const minAllowedRightAngle = Math.PI / 2 - allowedErrorAngle
  const maxAllowedRightAngle = Math.PI / 2 + allowedErrorAngle
  const topLeftAngle = angleBetweenPoints(bottomLeft, topLeft, topRight)
  const topRightAngle = angleBetweenPoints(topLeft, topRight, bottomRight)
  const bottomLeftAngle = angleBetweenPoints(bottomRight, bottomLeft, topLeft)
  const bottomRightAngle = angleBetweenPoints(topRight, bottomRight, bottomLeft)
  return {
    isRectangle:
      topLeftAngle >= minAllowedRightAngle &&
      topLeftAngle <= maxAllowedRightAngle &&
      topRightAngle >= minAllowedRightAngle &&
      topRightAngle <= maxAllowedRightAngle &&
      bottomLeftAngle >= minAllowedRightAngle &&
      bottomLeftAngle <= maxAllowedRightAngle &&
      bottomRightAngle >= minAllowedRightAngle &&
      bottomRightAngle <= maxAllowedRightAngle,
    angles: [topLeftAngle, topRightAngle, bottomLeftAngle, bottomRightAngle],
  }
}
