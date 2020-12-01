import { Point, Rect } from '../types'
import { PIXEL_BLACK } from '../utils/binarize'
import { getImageChannelCount } from '../utils/imageFormatUtils'
import { VisitedPoints } from '../utils/VisitedPoints'

export type Edge = Int32Array

export interface Shape {
  bounds: Rect
  edges: {
    top: Edge
    right: Edge
    bottom: Edge
    left: Edge
  }
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
