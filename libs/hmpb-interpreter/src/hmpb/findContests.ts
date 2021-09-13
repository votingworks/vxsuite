import {
  AnyContest,
  Contests,
  Corners,
  Rect,
  BallotPageContestLayout,
  BallotPageLayout,
} from '@votingworks/types'
import { zip } from '@votingworks/utils'
import makeDebug from 'debug'
import { PIXEL_BLACK } from '../utils/binarize'
import { getCorners } from '../utils/corners'
import { euclideanDistance, poly4Area } from '../utils/geometry'
import { getImageChannelCount } from '../utils/imageFormatUtils'
import { VisitedPoints } from '../utils/VisitedPoints'
import { findShape, parseRectangle, Shape } from './shapes'

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

    y += 1
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
      consecutiveWhitePixels += 1
      debug(
        'found a white pixel at x=%d y=%d, count=%d',
        x,
        y,
        consecutiveWhitePixels
      )
    }

    y += 1
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
    maxExpectedHeight = Math.ceil(0.96 * ballotImage.height),
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
      y += 1
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

      const shape = findShape(
        ballotImage,
        { x: columnMidX, y },
        { visitedPoints, maximumSkipDistance: 2, maximumAllowedSkipCount: 15 }
      )

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

export interface BallotLayoutCorrespondence {
  corresponds: boolean
  mismatchedContests: {
    template: BallotPageContestLayout
    ballot: BallotPageContestLayout
    definition: AnyContest
  }[]
}

export function findBallotLayoutCorrespondence(
  contests: Contests,
  ballot: BallotPageLayout,
  template: BallotPageLayout,
  { allowedScaleErrorRatio = 0.1 } = {}
): BallotLayoutCorrespondence {
  const expectedAreaScale =
    (ballot.ballotImage.imageData.width * ballot.ballotImage.imageData.height) /
    (template.ballotImage.imageData.width *
      template.ballotImage.imageData.height)
  const minAreaScale = expectedAreaScale * (1 - allowedScaleErrorRatio)
  const maxAreaScale = expectedAreaScale * (1 + allowedScaleErrorRatio)
  const mismatchedContests: BallotLayoutCorrespondence['mismatchedContests'] = []

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
