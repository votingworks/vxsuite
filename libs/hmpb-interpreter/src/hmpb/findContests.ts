import { AnyContest, Contests } from '@votingworks/ballot-encoder'
import makeDebug from 'debug'
import { drawTarget, fill } from '../cli/commands/layout'
import {
  BallotPageContestLayout,
  BallotPageLayout,
  Corners,
  Point,
  Rect,
} from '../types'
import { PIXEL_BLACK } from '../utils/binarize'
import { getCorners } from '../utils/corners'
import {
  euclideanDistance,
  poly4Area,
  range,
  roundPoint,
} from '../utils/geometry'
import { getImageChannelCount } from '../utils/imageFormatUtils'
import { zip } from '../utils/iterators'
import { VisitedPoints } from '../utils/VisitedPoints'
import {
  expandLineSegment,
  findShape,
  lineSegmentEndpoints,
  parseRectangle,
  Shape,
} from './shapes'

const debug = makeDebug('hmpb-interpreter:findContests')

export interface ContestShape {
  bounds: Rect
  corners: Corners
}

export interface Options {
  inset?: number
  separation?: number
  columns?: readonly boolean[]
  expectedWidth?: number
  minExpectedHeight?: number
  maxExpectedHeight?: number
  errorMargin?: number
}

export function findHorizontalLine({
  imageData,
  bounds,
  minHeight,
  maxHeight,
  minDensity = 0.5,
  edgeContrastRatio = 0.2,
  expansionBlockSize = 5,
}: {
  imageData: ImageData
  bounds: Rect
  minHeight: number
  maxHeight: number
  minDensity?: number
  edgeContrastRatio?: number
  expansionBlockSize?: number
}): Rect | undefined {
  const channels = getImageChannelCount(imageData)

  const expectedLeft = bounds.x
  const expectedRight = bounds.x + bounds.width
  const xSearchRange = range(
    Math.round(expectedLeft + bounds.width * 0.4),
    Math.round(expectedRight - bounds.width * 0.4)
  )

  let lineStartY = -1
  let maxMatchingPixels = -1
  const matchingPixelsByY = new Int32Array(imageData.height)
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    let matchingPixelsAtY = 0
    for (const x of xSearchRange) {
      if (
        imageData.data[channels * (x + y * imageData.width)] === PIXEL_BLACK
      ) {
        matchingPixelsAtY++
      }
    }
    matchingPixelsByY[y] = matchingPixelsAtY
    if (matchingPixelsAtY > maxMatchingPixels) {
      maxMatchingPixels = matchingPixelsAtY
    }

    if (lineStartY < 0) {
      // we're not looking at any potential line right now
      if (matchingPixelsAtY > 0) {
        // start tracking as soon as we find anything
        lineStartY = y
      }
    } else {
      // we're within a potential line now
      if (matchingPixelsAtY < maxMatchingPixels * edgeContrastRatio) {
        // this looks like the end
        if (y - lineStartY < minHeight) {
          // too short
          lineStartY = -1
          maxMatchingPixels = -1
        } else if (y - lineStartY > maxHeight) {
          // too tall
          lineStartY = -1
          maxMatchingPixels = -1
        } else {
          // just right
          const potentialSegmentBounds: Rect = {
            x: xSearchRange[0],
            y: lineStartY,
            width: xSearchRange[xSearchRange.length - 1] - xSearchRange[0] + 1,
            height: y - lineStartY + 1,
          }

          let areaFill = 0
          for (let i = lineStartY; i < y; i++) {
            areaFill += matchingPixelsByY[i]
          }
          const totalArea =
            potentialSegmentBounds.width * potentialSegmentBounds.height
          if (areaFill < minDensity * totalArea) {
            // not dense enough to be a line
            lineStartY = -1
            maxMatchingPixels = -1
          } else {
            const segmentBounds: Rect = {
              x: xSearchRange[0],
              y: lineStartY,
              width:
                xSearchRange[xSearchRange.length - 1] - xSearchRange[0] + 1,
              height: y - lineStartY + 1,
            }
            const expansionBounds: Rect = {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: maxHeight,
            }
            debug(
              'found horizontal line from y=%d with height=%d; expanding within %o',
              segmentBounds.y,
              segmentBounds.height,
              expansionBounds
            )

            return expandLineSegment({
              imageData: imageData,
              segmentBounds: expandLineSegment({
                imageData: imageData,
                segmentBounds,
                bounds: expansionBounds,
                direction: { x: -expansionBlockSize, y: 0 },
              }),
              bounds: expansionBounds,
              direction: { x: expansionBlockSize, y: 0 },
            })
          }
        }
      }
    }
  }

  return undefined
}

export default function* findContests(
  ballotImage: ImageData,
  {
    inset = Math.round(0.035 * ballotImage.width),
    separation = Math.round(0.0175 * ballotImage.width),
    columns = [true, true, true],
    expectedWidth = Math.floor(
      (ballotImage.width - 2 * inset - (columns.length - 1) * separation) /
        columns.length
    ),
    minExpectedHeight = Math.floor(0.1 * ballotImage.height),
    maxExpectedHeight = Math.ceil(0.9 * ballotImage.height),
    errorMargin = Math.ceil(0.025 * ballotImage.width),
  }: Options = {}
): Generator<ContestShape> {
  const visitedPoints = new VisitedPoints(ballotImage.width, ballotImage.height)

  for (const [columnIndex, column] of columns.entries()) {
    if (!column) {
      continue
    }

    const columnMidX = Math.round(
      inset + columnIndex * (expectedWidth + separation) + expectedWidth / 2
    )

    let lastShape: Shape | undefined
    const expectedContestTop =
      findTopBorderInset(ballotImage, columnMidX, {
        yMax: inset - errorMargin,
      }) + inset

    for (
      let y = expectedContestTop - errorMargin;
      y < ballotImage.height - inset - minExpectedHeight + errorMargin;
      y++
    ) {
      if (!lastShape && y > expectedContestTop + errorMargin) {
        debug(
          'abandoning column %d because no top contest was found by y=%d',
          columnIndex,
          y
        )
        break
      }

      if (
        lastShape &&
        y >
          lastShape.bounds.y +
            lastShape.bounds.height +
            separation +
            errorMargin
      ) {
        debug(
          'abandoning the rest of column %d because we should have found another contest box by y=%d',
          columnIndex,
          y
        )
        break
      }

      const shape = findShape(ballotImage, { x: columnMidX, y }, visitedPoints)

      if (shape.bounds.width <= 1 || shape.bounds.height <= 1) {
        continue
      }

      const corners = getCorners(shape)
      const rectangle = parseRectangle(corners)

      const cornerBasedWidth = Math.max(
        euclideanDistance(corners[0], corners[1]),
        euclideanDistance(corners[2], corners[3])
      )
      const cornerBasedHeight = Math.max(
        euclideanDistance(corners[0], corners[2]),
        euclideanDistance(corners[1], corners[3])
      )

      if (!rectangle.isRectangle) {
        debug(
          'skipping shape because it is not rectangular: bounds=%O, corners=%O, angles=%O',
          shape.bounds,
          corners,
          rectangle.angles.map(
            (angle) => `${Math.round(((angle * 180) / Math.PI) * 100) / 100}°`
          )
        )
      } else if (
        cornerBasedHeight < minExpectedHeight ||
        cornerBasedHeight > maxExpectedHeight ||
        cornerBasedWidth < expectedWidth - errorMargin ||
        cornerBasedWidth > expectedWidth + errorMargin
      ) {
        debug(
          'skipping shape because it is the wrong size: bounds=%O, actual=%dˣ%d, min=%dˣ%d, max=%dˣ%d',
          shape.bounds,
          cornerBasedWidth,
          cornerBasedHeight,
          expectedWidth - errorMargin,
          minExpectedHeight,
          expectedWidth + errorMargin,
          maxExpectedHeight
        )
      } else {
        debug('found contest shape: %O', shape.bounds)
        yield {
          bounds: shape.bounds,
          corners,
        }
        lastShape = shape
      }

      y = shape.bounds.y + shape.bounds.height
    }
  }
}

export function findMatchingContests(
  ballotImage: ImageData,
  ballotLayout: BallotPageLayout
): ContestShape[] {
  const contestShapes: ContestShape[] = []

  const mapRect = (rect: Rect): Rect => ({
    ...mapPoint(rect),
    width:
      rect.width *
      (ballotImage.width / ballotLayout.ballotImage.imageData.width),
    height:
      rect.height *
      (ballotImage.height / ballotLayout.ballotImage.imageData.height),
  })

  const mapPoint = (point: Point): Point =>
    roundPoint({
      x:
        (ballotImage.width / ballotLayout.ballotImage.imageData.width) *
        point.x,
      y:
        (ballotImage.height / ballotLayout.ballotImage.imageData.height) *
        point.y,
    })

  for (const [i, contestShape] of ballotLayout.contests.entries()) {
    const previousContestShape = ballotLayout.contests[i - 1]
    const yStart = Math.round(
      previousContestShape
        ? (previousContestShape.bounds.y +
            previousContestShape.bounds.height +
            contestShape.bounds.y) /
            2
        : contestShape.bounds.y / 2
    )
    const contestBoxTopLine = findHorizontalLine({
      imageData: ballotImage,
      bounds: mapRect({ ...contestShape.bounds, y: yStart }),
      minHeight: 8,
      maxHeight: 25,
    })

    let start: Point | undefined
    let end: Point | undefined
    if (contestBoxTopLine) {
      fill(ballotImage, contestBoxTopLine, [0, 0xff, 0, 0x66])
      ;[start, end] = lineSegmentEndpoints({
        imageData: ballotImage,
        lineSegmentBounds: contestBoxTopLine,
        color: PIXEL_BLACK,
      })
      drawTarget(ballotImage, start, [0xff, 0, 0, 0x60], 30)
      drawTarget(ballotImage, end, [0xff, 0, 0, 0x60], 30)
    }

    console.log(`contest #${i + 1} top line:`, contestBoxTopLine, {
      start,
      end,
    })
  }

  return contestShapes
}

function findTopBorderInset(
  { data, width, height }: ImageData,
  x: number,
  {
    yMax = height - 1,
    minimumConsecutiveWhitePixels = Math.ceil(height * 0.005),
  } = {}
): number {
  debug(
    'looking for top inset at x=%d within %dpx of the top with a run of %d white pixels',
    x,
    yMax + 1,
    minimumConsecutiveWhitePixels
  )
  const channels = getImageChannelCount({ data, width, height })

  // Look for black border within [0, yMax].
  let seen = false
  let y = 0

  while (y <= yMax) {
    const color = data[(y * width + x) * channels]

    if (color === PIXEL_BLACK) {
      seen = true
      break
    }

    y++
  }

  if (!seen) {
    // Didn't find one.
    debug('no border found by x=%d y=%d', x, y)
    return 0
  }

  // Look for a run of white pixels that marks the end of the border.
  let consecutiveWhitePixels = 0

  while (consecutiveWhitePixels < minimumConsecutiveWhitePixels && y < height) {
    const color = data[(y * width + x) * channels]

    if (color === PIXEL_BLACK) {
      consecutiveWhitePixels = 0
    } else {
      consecutiveWhitePixels++
      debug(
        'found a white pixel at x=%d y=%d, count=%d',
        x,
        y,
        consecutiveWhitePixels
      )
    }

    y++
  }

  if (consecutiveWhitePixels < minimumConsecutiveWhitePixels) {
    debug('did not find the end of a border')
    return 0
  }

  debug(
    'end of the border found starting at x=%d y=%d',
    x,
    y - consecutiveWhitePixels
  )
  return y - consecutiveWhitePixels
}

export interface BallotLayoutCorrespondance {
  corresponds: boolean
  mismatchedContests: {
    template: BallotPageContestLayout
    ballot: BallotPageContestLayout
    definition: AnyContest
  }[]
}

export function findBallotLayoutCorrespondance(
  contests: Contests,
  ballot: BallotPageLayout,
  template: BallotPageLayout,
  { allowedScaleErrorRatio = 0.1 } = {}
): BallotLayoutCorrespondance {
  const expectedAreaScale =
    (ballot.ballotImage.imageData.width * ballot.ballotImage.imageData.height) /
    (template.ballotImage.imageData.width *
      template.ballotImage.imageData.height)
  const minAreaScale = expectedAreaScale * (1 - allowedScaleErrorRatio)
  const maxAreaScale = expectedAreaScale * (1 + allowedScaleErrorRatio)
  const mismatchedContests: BallotLayoutCorrespondance['mismatchedContests'] = []

  for (const [definition, templateContest, ballotContest] of zip(
    contests,
    template.contests,
    ballot.contests
  )) {
    const templateArea = poly4Area(templateContest.corners)
    const ballotArea = poly4Area(ballotContest.corners)
    const areaScale = ballotArea / templateArea
    if (areaScale < minAreaScale || areaScale > maxAreaScale) {
      mismatchedContests.push({
        definition,
        template: templateContest,
        ballot: ballotContest,
      })
    }
  }

  return {
    corresponds: mismatchedContests.length === 0,
    mismatchedContests,
  }
}
