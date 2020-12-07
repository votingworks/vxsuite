import { AnyContest, Contests } from '@votingworks/ballot-encoder'
import makeDebug from 'debug'
// import { drawTarget, fill } from '../cli/commands/layout'
import {
  BallotPageContestLayout,
  BallotPageLayout,
  Corners,
  Point,
  Rect,
} from '../types'
import { PIXEL_BLACK } from '../utils/binarize'
import { getCorners } from '../utils/corners'
import { findInsetEdges } from '../utils/edges'
import {
  euclideanDistance,
  poly4Area,
  rect,
  rectClip,
  rectContains,
  rectShift,
  roundPoint,
} from '../utils/geometry'
import { getImageChannelCount } from '../utils/imageFormatUtils'
import { zip } from '../utils/iterators'
import { VisitedPoints } from '../utils/VisitedPoints'
import { computeAreaFill, findShape, parseRectangle, Shape } from './shapes'

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

export function* followStroke({
  imageData,
  strokeBounds,
  bounds,
  searchDirection,
  edgeContrastRatio = 0.1,
}: {
  imageData: ImageData
  strokeBounds: Rect
  bounds: Rect
  searchDirection: 'up' | 'down' | 'left' | 'right'
  edgeContrastRatio?: number
}): Generator<Rect> {
  if (searchDirection === 'up' || searchDirection === 'down') {
    const yStep =
      searchDirection === 'up' ? -strokeBounds.height : strokeBounds.height

    let searchArea = rectShift(strokeBounds, { x: 0, y: yStep })
    const lastFill = computeAreaFill(imageData, searchArea)
    while (rectContains(bounds, searchArea)) {
      const fill = computeAreaFill(imageData, searchArea)

      if (lastFill * edgeContrastRatio >= fill) {
        break
      }

      const leftNudge = rectShift(searchArea, {
        x: -1,
        y: 0,
      })
      const rightNudge = rectShift(searchArea, {
        x: 1,
        y: 0,
      })

      const nudgeThreshold = fill * 1.05
      const leftFill = computeAreaFill(imageData, leftNudge)
      const rightFill = computeAreaFill(imageData, rightNudge)
      const adjustedSearchArea =
        leftFill >= nudgeThreshold && fill > rightFill
          ? leftNudge
          : rightFill >= nudgeThreshold && fill > leftFill
          ? rightNudge
          : searchArea

      yield adjustedSearchArea

      searchArea = rectShift(adjustedSearchArea, { x: 0, y: yStep })
    }
  } else {
    const xStep =
      searchDirection === 'left' ? -strokeBounds.width : strokeBounds.width

    let searchArea = rectShift(strokeBounds, { x: xStep, y: 0 })
    const lastFill = computeAreaFill(imageData, searchArea)
    while (rectContains(bounds, searchArea)) {
      const fill = computeAreaFill(imageData, searchArea)

      if (lastFill * edgeContrastRatio >= fill) {
        break
      }

      const upNudge = rectShift(searchArea, {
        x: 0,
        y: -1,
      })
      const downNudge = rectShift(searchArea, {
        x: 0,
        y: 1,
      })

      const nudgeThreshold = fill * 1.05
      const upFill = computeAreaFill(imageData, upNudge)
      const downFill = computeAreaFill(imageData, downNudge)
      const adjustedSearchArea =
        upFill >= nudgeThreshold && fill > downFill
          ? upNudge
          : downFill >= nudgeThreshold && fill > upFill
          ? downNudge
          : searchArea

      yield adjustedSearchArea

      searchArea = rectShift(adjustedSearchArea, { x: xStep, y: 0 })
    }
  }
}

export function findStroke({
  imageData,
  bounds,
  minThickness,
  maxThickness,
  searchDirection,
  minDensity = 0.2,
  edgeContrastRatio = 0.2,
}: {
  imageData: ImageData
  bounds: Rect
  minThickness: number
  maxThickness: number
  searchDirection: 'up' | 'down' | 'left' | 'right'
  minDensity?: number
  edgeContrastRatio?: number
}): Rect | undefined {
  if (searchDirection === 'up' || searchDirection === 'down') {
    const fillByY = new Int32Array(bounds.height)
    const yStart =
      searchDirection === 'up' ? bounds.y + bounds.height - 1 : bounds.y
    const yStep = searchDirection === 'up' ? -1 : 1
    let strokeStart = -1

    for (let yi = 0; yi < bounds.height; yi++) {
      const y = yStart + yi * yStep
      const fill = computeAreaFill(imageData, {
        ...bounds,
        y,
        height: 1,
      })
      fillByY[yi] = fill

      if (strokeStart < 0) {
        if (fill / bounds.width >= minDensity) {
          strokeStart = y
        }
      } else {
        const lastFill = fillByY[yi - 1]
        const thickness = Math.abs(y - strokeStart)
        if (lastFill * edgeContrastRatio < fill) {
          // keep looking
        } else if (thickness < minThickness) {
          // too thin
          strokeStart = -1
          yi--
        } else if (thickness > maxThickness) {
          // too thick
          strokeStart = -1
          yi--
        } else if (
          fillByY
            .slice(yi - thickness, yi)
            .reduce((sum, fill) => sum + fill, 0) /
            (thickness * bounds.width) <
          minDensity
        ) {
          // too sparse
          strokeStart = -1
          yi--
        } else {
          return {
            ...bounds,
            y: Math.min(strokeStart, y + 1),
            height: thickness,
          }
        }
      }
    }
  } else {
    const fillByX = new Int32Array(bounds.width)
    const xStart =
      searchDirection === 'left' ? bounds.x + bounds.width - 1 : bounds.x
    const xStep = searchDirection === 'left' ? -1 : 1
    let strokeStart = -1

    for (let xi = 0; xi < bounds.width; xi++) {
      const x = xStart + xi * xStep
      const fill = computeAreaFill(imageData, {
        ...bounds,
        x,
        width: 1,
      })
      fillByX[xi] = fill

      if (strokeStart < 0) {
        if (fill / bounds.height >= minDensity) {
          strokeStart = x
        }
      } else {
        const lastFill = fillByX[xi - 1]
        const thickness = Math.abs(x - strokeStart)
        if (lastFill * edgeContrastRatio < fill) {
          // keep looking
        } else if (thickness < minThickness) {
          // too thin
          strokeStart = -1
          xi--
        } else if (thickness > maxThickness) {
          // too thick
          strokeStart = -1
          xi--
        } else if (
          fillByX
            .slice(xi - thickness, xi)
            .reduce((sum, fill) => sum + fill, 0) /
            (thickness * bounds.height) <
          minDensity
        ) {
          // too sparse

          strokeStart = -1
          xi--
        } else {
          return {
            ...bounds,
            x: Math.min(strokeStart, x + 1),
            width: thickness,
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
    width: Math.round(
      rect.width *
        (ballotImage.width / ballotLayout.ballotImage.imageData.width)
    ),
    height: Math.round(
      rect.height *
        (ballotImage.height / ballotLayout.ballotImage.imageData.height)
    ),
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
      previousContestShape &&
        previousContestShape.bounds.x === contestShape.bounds.x
        ? (previousContestShape.bounds.y +
            previousContestShape.bounds.height +
            contestShape.bounds.y) /
            2
        : contestShape.bounds.y / 2
    )

    const contestBoxFromOffset = mapRect({ ...contestShape.bounds, y: yStart })
    const contestBoxTopLineSearchArea = rectShift(
      {
        ...contestBoxFromOffset,
        width: Math.round(contestBoxFromOffset.width / 2),
      },
      { x: Math.round(contestBoxFromOffset.width / 4), y: 0 }
    )
    const contestBoxTopLine = findStroke({
      imageData: ballotImage,
      bounds: contestBoxTopLineSearchArea,
      minThickness: 8,
      maxThickness: 25,
      searchDirection: 'down',
    })
    const contestBoxTopLineParts: Rect[] = []
    const contestBoxLeftLineParts: Rect[] = []
    const contestBoxRightLineParts: Rect[] = []
    const contestBoxBottomLineParts: Rect[] = []
    let contestBoxBottomLine: Rect | undefined

    if (contestBoxTopLine) {
      for (const part of followStroke({
        imageData: ballotImage,
        bounds: {
          x: 0,
          y: 0,
          width: ballotImage.width,
          height: ballotImage.height,
        },
        searchDirection: 'left',
        strokeBounds: {
          ...contestBoxTopLine,
          width: 15,
        },
      })) {
        contestBoxTopLineParts.push(part)
      }

      for (const part of followStroke({
        imageData: ballotImage,
        bounds: {
          x: 0,
          y: 0,
          width: ballotImage.width,
          height: ballotImage.height,
        },
        searchDirection: 'right',
        strokeBounds: {
          ...contestBoxTopLine,
          x: contestBoxTopLine.x + contestBoxTopLine.width - 15,
          width: 15,
        },
      })) {
        contestBoxTopLineParts.push(part)
      }
    }

    if (contestBoxTopLine) {
      const contestBoxLeftLinePart = findStroke({
        imageData: ballotImage,
        bounds: rect({
          left: contestBoxFromOffset.x - 100,
          top: contestBoxTopLine.y + contestBoxTopLine.height,
          right: contestBoxFromOffset.x + 100,
          bottom: contestBoxTopLine.y + contestBoxTopLine.height + 20,
        }),
        maxThickness: 6,
        minThickness: 2,
        searchDirection: 'left',
      })
      const contestBoxRightLinePart = findStroke({
        imageData: ballotImage,
        bounds: {
          x: Math.round(contestBoxTopLine.x + contestBoxTopLine.width / 2),
          y: contestBoxTopLine.y + contestBoxTopLine.height,
          width:
            ballotImage.width -
            Math.round(contestBoxTopLine.x + contestBoxTopLine.width / 2) +
            1,
          height: 20,
        },
        maxThickness: 6,
        minThickness: 2,
        searchDirection: 'right',
      })

      if (contestBoxLeftLinePart) {
        contestBoxLeftLineParts.push(contestBoxLeftLinePart)
        for (const part of followStroke({
          imageData: ballotImage,
          strokeBounds: contestBoxLeftLinePart,
          bounds: rect({
            x: contestBoxLeftLinePart.x - 30,
            y: contestBoxLeftLinePart.y,
            width: 60,
            height: contestBoxFromOffset.height * 1.1,
          }),
          searchDirection: 'down',
        })) {
          contestBoxLeftLineParts.push(part)
        }
      }
      if (contestBoxRightLinePart) {
        contestBoxRightLineParts.push(contestBoxRightLinePart)
        for (const part of followStroke({
          imageData: ballotImage,
          strokeBounds: contestBoxRightLinePart,
          // FIXME
          bounds: rect({
            x: contestBoxRightLinePart.x - 30,
            y: contestBoxRightLinePart.y,
            width: 60,
            height: contestBoxFromOffset.height * 1.1,
          }),
          searchDirection: 'down',
        })) {
          contestBoxRightLineParts.push(part)
        }
      }
    }

    if (
      contestBoxTopLine &&
      (contestBoxLeftLineParts.length > 0 ||
        contestBoxRightLineParts.length > 0)
    ) {
      const bounds = {
        x: contestBoxTopLine.x,
        y: contestBoxTopLine.y + 30,
        width: contestBoxTopLine.width,
        height: contestBoxFromOffset.height,
      }
      contestBoxBottomLine = findStroke({
        imageData: ballotImage,
        bounds,
        minThickness: 2,
        maxThickness: 6,
        searchDirection: 'up',
      })

      if (contestBoxBottomLine) {
        for (const part of followStroke({
          imageData: ballotImage,
          bounds: {
            x: 0,
            y: 0,
            width: ballotImage.width,
            height: ballotImage.height,
          },
          strokeBounds: {
            ...contestBoxBottomLine,
            width: 15,
          },
          searchDirection: 'left',
        })) {
          contestBoxBottomLineParts.push(part)
        }

        for (const part of followStroke({
          imageData: ballotImage,
          bounds: {
            x: 0,
            y: 0,
            width: ballotImage.width,
            height: ballotImage.height,
          },
          strokeBounds: {
            ...contestBoxBottomLine,
            x: contestBoxBottomLine.x + contestBoxBottomLine.width - 15,
            width: 15,
          },
          searchDirection: 'right',
        })) {
          contestBoxBottomLineParts.push(part)
        }
      }
    }

    const boundsPadding = 5
    const left =
      Math.min(
        ...[
          ...contestBoxLeftLineParts,
          ...contestBoxTopLineParts,
          ...contestBoxBottomLineParts,
        ].map(({ x }) => x)
      ) - boundsPadding
    const right =
      Math.max(
        ...[
          ...contestBoxRightLineParts,
          ...contestBoxTopLineParts,
          ...contestBoxBottomLineParts,
        ].map(({ x, width }) => x + width)
      ) + boundsPadding
    const top =
      Math.min(
        ...[
          ...contestBoxTopLineParts,
          ...contestBoxLeftLineParts,
          ...contestBoxRightLineParts,
        ].map(({ y }) => y)
      ) - boundsPadding
    const bottom =
      Math.max(
        ...[
          ...contestBoxLeftLineParts,
          ...contestBoxRightLineParts,
          ...contestBoxBottomLineParts,
        ].map(({ y, height }) => y + height)
      ) + boundsPadding
    const contestBounds = rectClip(
      { x: 0, y: 0, width: ballotImage.width, height: ballotImage.height },
      {
        x: left,
        y: top,
        width: right - left + 1,
        height: bottom - top + 1,
      }
    )
    const edges = findInsetEdges(ballotImage, contestBounds)
    const corners = getCorners({ bounds: contestBounds, edges })

    contestShapes.push({
      bounds: contestBounds,
      corners,
    })

    // fill(ballotImage, contestBounds, [0, 0xff, 0, 0x66])

    // if (contestBoxTopLine) {
    //   fill(ballotImage, contestBoxTopLine, [0, 0xff, 0xff, 0x66])
    // }

    // for (const [i, part] of contestBoxTopLineParts.entries()) {
    //   fill(ballotImage, part, [
    //     0xff,
    //     (i % 2) * 0xff,
    //     ((i + 1) % 2) * 0xff,
    //     0x60,
    //   ])
    // }
    // for (const [i, part] of contestBoxLeftLineParts.entries()) {
    //   fill(ballotImage, part, [(i % 2) * 0xff, ((i + 1) % 2) * 0xff, 0, 0x66])
    // }
    // for (const [i, part] of contestBoxRightLineParts.entries()) {
    //   fill(ballotImage, part, [(i % 2) * 0xff, ((i + 1) % 2) * 0xff, 0, 0x66])
    // }

    // if (contestBoxBottomLine) {
    //   fill(ballotImage, contestBoxBottomLine, [0, 0xff, 0xff, 0x60])
    // }

    // for (const [i, part] of contestBoxBottomLineParts.entries()) {
    //   fill(ballotImage, part, [
    //     0xff,
    //     (i % 2) * 0xff,
    //     ((i + 1) % 2) * 0xff,
    //     0x60,
    //   ])
    // }

    // for (const corner of corners) {
    //   drawTarget(ballotImage, corner, [0xff, 0, 0, 0x66], 25)
    // }
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
