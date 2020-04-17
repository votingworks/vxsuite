import { matrix_t } from 'jsfeat'
import { Point, Rect } from '../types'
import Map2d from './Map2d'

export const DEFAULT_MAX_FOREGROUND_COLOR = 200

export interface Shape {
  points: Map2d<number, number, boolean>
  bounds: Rect
}

export function* findShapes<TNext>(
  image: matrix_t,
  points: Generator<Point, void, TNext | undefined>,
  { threshold = DEFAULT_MAX_FOREGROUND_COLOR } = {}
): Generator<Shape, void, TNext> {
  const visitedPoints = new Map2d<number, number, boolean>()
  const pointsIterator = points[Symbol.iterator]()
  let nextArg: TNext | undefined

  while (true) {
    const next = pointsIterator.next(nextArg)

    if (next.done) {
      break
    }

    const { x, y } = next.value

    if (!visitedPoints.has(x, y)) {
      nextArg = yield findShape(image, { x, y }, visitedPoints, { threshold })
    } else {
      nextArg = undefined
    }
  }
}

export function findShape(
  image: matrix_t,
  startingPoint: Point,
  visitedPoints = new Map2d<number, number, boolean>(),
  { threshold = DEFAULT_MAX_FOREGROUND_COLOR } = {}
): Shape {
  const toVisit: Point[] = [startingPoint]
  const points = new Map2d<number, number, boolean>()
  const { data, cols, channel } = image

  let xMin = startingPoint.x
  let yMin = startingPoint.y
  let xMax = startingPoint.x
  let yMax = startingPoint.y

  for (let point: Point | undefined; (point = toVisit.shift()); point) {
    const { x, y } = point

    if (visitedPoints.has(x, y)) {
      continue
    }
    visitedPoints.set(x, y, true)

    const index = (x + y * cols) * channel
    const color = data[index]
    const isForeground = color <= threshold
    points.set(x, y, isForeground)

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

          if (!points.has(nextX, nextY)) {
            toVisit.push({ x: nextX, y: nextY })
          }
        }
      }
    }
  }

  return {
    points: points.filter((_x, _y, isForeground) => isForeground),
    bounds: { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin },
  }
}
