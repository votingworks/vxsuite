import { Point, Rect } from '../types'
import { PIXEL_BLACK } from '../utils/binarize'
import { getImageChannelCount } from '../utils/imageFormatUtils'
import { VisitedPoints } from '../utils/VisitedPoints'

export interface Shape {
  bounds: Rect
}

/**
 * Finds shapes in a binarized image by looking for adjacent pixels of a
 * specific color looking at points from a point generator.
 */
export function* findShapes<TNext>(
  imageData: ImageData,
  points: Generator<Point, void, TNext | undefined>,
  { color = PIXEL_BLACK } = {}
): Generator<Shape, void, TNext> {
  const visitedPoints = new VisitedPoints(imageData.width, imageData.height)
  const pointsIterator = points[Symbol.iterator]()
  let nextArg: TNext | undefined

  while (true) {
    const next = pointsIterator.next(nextArg)

    if (next.done) {
      break
    }

    const { x, y } = next.value

    if (!visitedPoints.has(x, y)) {
      nextArg = yield findShape(imageData, { x, y }, visitedPoints, { color })
    } else {
      nextArg = undefined
    }
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
  }
}
