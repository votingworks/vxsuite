import { matrix_t } from 'jsfeat'
import { Rect } from '../types'
import scanColumns from './scanColumns'
import { findShapes, Shape } from './shapes'

export default function* findContests(
  ballotImage: matrix_t,
  {
    inset = 0,
    minContestWidthPercent = 20,
    minContestHeightPercent = 10,
    maxTopContestOffsetPercent = 5,
    columns = [true, true, true],
  } = {}
): Generator<Shape> {
  const bounds: Rect = {
    x: inset,
    y: inset,
    width: ballotImage.cols - inset,
    height: ballotImage.rows - inset,
  }
  const minContestWidth = Math.floor(
    (minContestWidthPercent * ballotImage.cols) / 100
  )
  const minContestHeight = Math.floor(
    (minContestHeightPercent * ballotImage.rows) / 100
  )
  const maxTopContestOffset = Math.floor(
    (maxTopContestOffsetPercent * ballotImage.rows) / 100
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

    const isShapeBigEnough =
      shape.bounds.width >= minContestWidth &&
      shape.bounds.height >= minContestHeight
    const isShapeCloseEnoughToLastShape =
      lastContestShape && shape.bounds.y > lastContestShape.bounds.y
        ? lastContestShape.bounds.y +
            lastContestShape.bounds.height +
            maxTopContestOffset >=
          shape.bounds.y
        : maxTopContestOffset >= shape.bounds.y

    if (isShapeBigEnough && isShapeCloseEnoughToLastShape) {
      yield shape
      nextY = shape.bounds.y + shape.bounds.height + 1
      lastContestShape = shape
    } else {
      nextY = undefined
    }
  }
}
