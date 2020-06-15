import makeDebug from 'debug'
import { Corners, Point, Rect } from '../types'
import { PIXEL_BLACK } from '../utils/binarize'
import { rectCorners } from '../utils/geometry'
import { getImageChannelCount } from '../utils/imageFormatUtils'
import scanColumns from './scanColumns'
import { findShapes, Shape } from './shapes'

const debug = makeDebug('hmpb-interpreter:findContests')

export interface ContestShape {
  bounds: Rect
  corners: Corners
}

export default function* findContests(
  ballotImage: ImageData,
  {
    inset = 0,
    minContestWidthPercent = 20,
    minContestHeightPercent = 10,
    maxContestWidthPercent = 40,
    maxContestHeightPercent = 90,
    maxTopContestOffsetPercent = 5,
    columns = [true, true, true],
  } = {}
): Generator<ContestShape> {
  const bounds: Rect = {
    x: inset,
    y: inset,
    width: ballotImage.width - inset,
    height: ballotImage.height - inset,
  }
  const minContestWidth = Math.floor(
    (minContestWidthPercent * ballotImage.width) / 100
  )
  const minContestHeight = Math.floor(
    (minContestHeightPercent * ballotImage.height) / 100
  )
  const maxContestWidth = Math.floor(
    (maxContestWidthPercent * ballotImage.width) / 100
  )
  const maxContestHeight = Math.floor(
    (maxContestHeightPercent * ballotImage.height) / 100
  )
  const maxTopContestOffset = Math.floor(
    (maxTopContestOffsetPercent * ballotImage.height) / 100
  )

  let nextY: number | undefined
  let lastContestShape: Shape | undefined
  const shapeIterator = findShapes(
    ballotImage,
    scanColumns(bounds, { columns })
  )

  while (true) {
    const next =
      typeof nextY === 'number'
        ? shapeIterator.next(nextY)
        : shapeIterator.next()

    if (next.done) {
      break
    }

    const shape = next.value

    const isShapeSizedAppropriately =
      shape.bounds.width >= minContestWidth &&
      shape.bounds.height >= minContestHeight &&
      shape.bounds.width <= maxContestWidth &&
      shape.bounds.height <= maxContestHeight
    const isShapeCloseEnoughToLastShape =
      lastContestShape && shape.bounds.y > lastContestShape.bounds.y
        ? lastContestShape.bounds.y +
            lastContestShape.bounds.height +
            maxTopContestOffset >=
          shape.bounds.y
        : maxTopContestOffset >= shape.bounds.y

    if (isShapeSizedAppropriately && isShapeCloseEnoughToLastShape) {
      debug(
        'found a shape with the right size and proximity to the last shape: %O',
        shape.bounds
      )
      yield {
        bounds: shape.bounds,
        corners: getCorners(ballotImage, shape),
      }
      nextY = shape.bounds.y + shape.bounds.height + 1
      lastContestShape = shape
    } else {
      if (shape.bounds.width > 0 && shape.bounds.height > 0) {
        debug(
          'skipping shape because it is not the right size or not close enough to the last shape: %O',
          shape.bounds
        )
      }
      nextY = undefined
    }
  }
}

function getCorners(imageData: ImageData, shape: Shape): Corners {
  const [topLeft, topRight, bottomLeft, bottomRight] = rectCorners(shape.bounds)

  return [
    findCorner(imageData, topLeft, { x: 1, y: 1 }),
    findCorner(imageData, topRight, { x: -1, y: 1 }),
    findCorner(imageData, bottomLeft, { x: 1, y: -1 }),
    findCorner(imageData, bottomRight, { x: -1, y: -1 }),
  ]
}

function findCorner(
  { data, width, height }: ImageData,
  { x: startX, y: startY }: Point,
  direction: Point
): Point {
  const channels = getImageChannelCount({ data, width, height })

  for (let step = 0; ; step += 1) {
    {
      const x = startX + step * direction.x
      const y = startY

      if (data[(y * width + x) * channels] === PIXEL_BLACK) {
        return { x, y }
      }
    }
    {
      const x = startX
      const y = startY + step * direction.y

      if (data[(y * width + x) * channels] === PIXEL_BLACK) {
        return { x, y }
      }
    }
  }
}
