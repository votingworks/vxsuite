import { AnyContest, Contests } from '@votingworks/ballot-encoder'
import makeDebug from 'debug'
import { drawTarget, fill } from '../cli/commands/layout'
import {
  BallotPageContestLayout,
  BallotPageLayout,
  Corners,
  Point,
  Rect,
  Vector,
} from '../types'
import { PIXEL_BLACK } from '../utils/binarize'
import { getCorners } from '../utils/corners'
import { findEdgeWithin } from '../utils/edges'
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
import { InspectImageLogger, SearchImageLogger } from '../utils/logging'
import { VisitedPoints } from '../utils/VisitedPoints'
import {
  computeAreaFill,
  Edges,
  findShape,
  parseRectangle,
  Shape,
} from './shapes'

const debug = makeDebug('hmpb-interpreter:findContests')

export interface ContestShape {
  bounds: Rect
  corners: Corners
}

export enum ContestImageTypes {
  LeftLine = 'contest-left-line',
  TopLine = 'contest-top-line',
  RightLine = 'contest-right-line',
  BottomLine = 'contest-bottom-line',
  Corner = 'contest-corner',
  TemplateBounds = 'contest-template-bounds',
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
  log,
}: {
  imageData: ImageData
  strokeBounds: Rect
  bounds: Rect
  searchDirection: 'up' | 'down' | 'left' | 'right'
  edgeContrastRatio?: number
  log?: SearchImageLogger<string>
}): Generator<Rect> {
  log?.begin(bounds, `searchDirection=${searchDirection}`)

  if (searchDirection === 'up' || searchDirection === 'down') {
    const yStep =
      searchDirection === 'up' ? -strokeBounds.height : strokeBounds.height

    let searchArea = rectShift(strokeBounds, { x: 0, y: yStep })
    const lastFill = computeAreaFill(imageData, searchArea)
    while (rectContains(bounds, searchArea)) {
      log?.test(searchArea)
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

      log?.add(adjustedSearchArea)
      yield adjustedSearchArea

      searchArea = rectShift(adjustedSearchArea, { x: 0, y: yStep })
    }
  } else {
    const xStep =
      searchDirection === 'left' ? -strokeBounds.width : strokeBounds.width

    let searchArea = rectShift(strokeBounds, { x: xStep, y: 0 })
    const lastFill = computeAreaFill(imageData, searchArea)
    while (rectContains(bounds, searchArea)) {
      log?.test(searchArea)
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

      log?.add(adjustedSearchArea)
      yield adjustedSearchArea

      searchArea = rectShift(adjustedSearchArea, { x: xStep, y: 0 })
    }
  }

  log?.commit()
}

export function findStroke({
  imageData,
  bounds,
  minThickness,
  maxThickness,
  searchDirection,
  minDensity = 0.2,
  edgeContrastRatio = 0.2,
  log,
}: {
  imageData: ImageData
  bounds: Rect
  minThickness: number
  maxThickness: number
  searchDirection: 'up' | 'down' | 'left' | 'right'
  minDensity?: number
  edgeContrastRatio?: number
  log?: SearchImageLogger<string>
}): Rect | undefined {
  let result: Rect | undefined
  log?.begin(bounds, `searchDirection=${searchDirection}`)

  const fills = new Int32Array(bounds.width)
  const start: Point = {
    x: searchDirection === 'left' ? bounds.x + bounds.width - 1 : bounds.x,
    y: searchDirection === 'up' ? bounds.y + bounds.height - 1 : bounds.y,
  }
  const step: Vector = {
    x: searchDirection === 'left' ? -1 : searchDirection === 'right' ? 1 : 0,
    y: searchDirection === 'up' ? -1 : searchDirection === 'down' ? 1 : 0,
  }
  let strokeStart: Point | undefined

  for (let i = 0; i < bounds.width; i++) {
    const point: Point = {
      x: start.x + i * step.x,
      y: start.y + i * step.y,
    }
    const fillRect = rect({
      ...point,
      width: Math.abs(step.x) || bounds.width,
      height: Math.abs(step.y) || bounds.height,
    })
    const fill = computeAreaFill(imageData, fillRect)
    log?.test(fillRect, 'looking for stroke')
    fills[i] = fill

    if (!strokeStart) {
      if (fill / (fillRect.width * fillRect.height) >= minDensity) {
        log?.add(fillRect, 'maybe found start of stroke')
        strokeStart = point
      }
    } else {
      const lastFill = fills[i - 1]
      const thickness = euclideanDistance(point, strokeStart)
      const updatedShape = rect({
        x: Math.min(point.x, strokeStart.x),
        y: Math.min(point.y, strokeStart.y),
        width: step.x ? thickness : bounds.width,
        height: step.y ? thickness : bounds.height,
      })
      if (lastFill * edgeContrastRatio < fill) {
        // keep looking
        log?.add(fillRect, 'found some more stroke')
      } else if (thickness < minThickness) {
        // too thin
        log?.reset(`too thin (${thickness} < ${minThickness})`)
        strokeStart = undefined
        i--
      } else if (thickness > maxThickness) {
        // too thick
        log?.reset(`too thick (${thickness} > ${maxThickness})`)
        strokeStart = undefined
        i--
      } else if (
        fills.slice(i - thickness, i).reduce((sum, fill) => sum + fill, 0) /
          (updatedShape.width * updatedShape.height) <
        minDensity
      ) {
        // too sparse
        log?.reset(`too sparse (< ${Math.round(minDensity * 100)}% filled)`)
        strokeStart = undefined
        i--
      } else {
        result = updatedShape
        break
      }
    }
  }

  if (result) {
    log?.update(result).commit('stroke found')
  } else {
    log?.cancel('no stroke found')
  }

  return result
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
  ballotLayout: BallotPageLayout,
  {
    definitions,
    log,
  }: {
    definitions?: Contests
    log?: InspectImageLogger<ContestImageTypes>
  } = {}
): ContestShape[] {
  const ballotImageBounds = rect({
    x: 0,
    y: 0,
    width: ballotImage.width,
    height: ballotImage.height,
  })
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
    const definition = definitions?.[i]
    const clog = log?.group(definition?.title ?? `contest #${i + 1}`)
    const previousTemplateShape = ballotLayout.contests[i - 1]
    const previousScannedShape = contestShapes[i - 1]
    const isSameColumn =
      !!previousTemplateShape &&
      previousTemplateShape.bounds.x === contestShape.bounds.x

    clog?.landmark(
      ContestImageTypes.TemplateBounds,
      mapRect(contestShape.bounds),
      'direct map of template contest'
    )
    const contestBoxFromOffset =
      isSameColumn && previousScannedShape
        ? {
            ...mapRect(contestShape.bounds),
            y:
              Math.max(
                previousScannedShape.corners[2].y,
                previousScannedShape.corners[3].y
              ) + 1,
          }
        : mapRect({
            ...contestShape.bounds,
            y: Math.round(contestShape.bounds.y / 2),
          })
    const contestBoxTopLineSearchArea = rectShift(
      {
        ...contestBoxFromOffset,
        width: Math.round(contestBoxFromOffset.width / 2),
      },
      { x: Math.round(contestBoxFromOffset.width / 4), y: 0 }
    )
    debug('looking for contest box top line')
    const contestBoxTopLine = findStroke({
      imageData: ballotImage,
      bounds: contestBoxTopLineSearchArea,
      minThickness: 8,
      maxThickness: 25,
      searchDirection: 'down',
      log: clog?.search(ContestImageTypes.TopLine),
    })

    const contestBoxTopLineParts: Rect[] = []
    const contestBoxLeftLineParts: Rect[] = []
    const contestBoxRightLineParts: Rect[] = []
    let contestBoxBottomLineParts: Rect[] = []
    let contestBoxBottomLine: Rect | undefined

    if (contestBoxTopLine) {
      contestBoxTopLineParts.push(contestBoxTopLine)
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
        log: clog?.search(ContestImageTypes.TopLine),
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
        log: clog?.search(ContestImageTypes.TopLine),
      })) {
        contestBoxTopLineParts.push(part)
      }
    }

    if (contestBoxTopLine) {
      const lowestTopLineBottomEdgeY = Math.max(
        ...contestBoxTopLineParts.map(({ y, height }) => y + height)
      )
      const contestBoxLeftLinePart = findStroke({
        imageData: ballotImage,
        bounds: rectClip(
          rect({
            left: contestBoxFromOffset.x - 100,
            top: lowestTopLineBottomEdgeY,
            right: contestBoxFromOffset.x + 100,
            bottom: lowestTopLineBottomEdgeY + 14,
          }),
          ballotImageBounds
        ),
        maxThickness: 6,
        minThickness: 2,
        searchDirection: 'left',
        log: clog?.search(ContestImageTypes.LeftLine),
      })
      const contestBoxRightLinePart = findStroke({
        imageData: ballotImage,
        bounds: rectClip(
          rect({
            left: contestBoxFromOffset.x + contestBoxFromOffset.width - 100,
            top: lowestTopLineBottomEdgeY,
            right: contestBoxFromOffset.x + contestBoxFromOffset.width + 100,
            bottom: lowestTopLineBottomEdgeY + 14,
          }),
          ballotImageBounds
        ),
        maxThickness: 6,
        minThickness: 2,
        searchDirection: 'right',
        log: clog?.search(ContestImageTypes.RightLine),
      })

      if (contestBoxLeftLinePart) {
        contestBoxLeftLineParts.push(contestBoxLeftLinePart)
        for (const part of followStroke({
          imageData: ballotImage,
          strokeBounds: contestBoxLeftLinePart,
          bounds: rect({
            x: 0,
            y: contestBoxFromOffset.y,
            width: ballotImage.width,
            height: contestBoxLeftLinePart.height,
          }),
          searchDirection: 'up',
          log: clog?.search(ContestImageTypes.LeftLine),
        })) {
          contestBoxLeftLineParts.push(part)
        }
        for (const part of followStroke({
          imageData: ballotImage,
          strokeBounds: contestBoxLeftLinePart,
          bounds: rectClip(
            rect({
              x: 0,
              y: contestBoxLeftLinePart.y,
              width: ballotImage.width,
              height: contestBoxFromOffset.height * 1.1,
            }),
            ballotImageBounds
          ),
          searchDirection: 'down',
          log: clog?.search(ContestImageTypes.LeftLine),
        })) {
          contestBoxLeftLineParts.push(part)
        }
      }
      if (contestBoxRightLinePart) {
        contestBoxRightLineParts.push(contestBoxRightLinePart)
        for (const part of followStroke({
          imageData: ballotImage,
          strokeBounds: contestBoxRightLinePart,
          bounds: rect({
            x: 0,
            y: contestBoxFromOffset.y,
            width: ballotImage.width,
            height: contestBoxFromOffset.height,
          }),
          searchDirection: 'up',
          log: clog?.search(ContestImageTypes.RightLine),
        })) {
          contestBoxRightLineParts.push(part)
        }
        for (const part of followStroke({
          imageData: ballotImage,
          strokeBounds: contestBoxRightLinePart,
          bounds: rectClip(
            rect({
              x: 0,
              y: contestBoxRightLinePart.y,
              width: ballotImage.width,
              height: contestBoxFromOffset.height * 1.1,
            }),
            ballotImageBounds
          ),
          searchDirection: 'down',
          log: clog?.search(ContestImageTypes.RightLine),
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
      const bottomLineFromSidesSearchLog = clog
        ?.search(ContestImageTypes.BottomLine)
        .begin(ballotImageBounds)
      const bottomLineFromBelowSearchLog = clog
        ?.search(ContestImageTypes.BottomLine)
        .begin(ballotImageBounds)

      const lowestSideLinePartY = Math.max(
        ...[...contestBoxLeftLineParts, ...contestBoxRightLineParts].map(
          ({ y }) => y
        )
      )

      let bottomStrokeLeftSidePart: Rect | undefined
      let bottomStrokeRightSidePart: Rect | undefined

      if (contestBoxLeftLineParts.length > 0) {
        const sortedLeftSideParts = [...contestBoxLeftLineParts].sort(
          (a, b) => b.y - a.y
        )

        if (sortedLeftSideParts[1]) {
          bottomStrokeLeftSidePart = findStroke({
            imageData: ballotImage,
            searchDirection: 'down',
            bounds: rect({
              x: sortedLeftSideParts[1].x + sortedLeftSideParts[1].width,
              y: sortedLeftSideParts[1].y,
              width: 50,
              height: sortedLeftSideParts[1].height * 3,
            }),
            minThickness: 2,
            maxThickness: 10,
            log: bottomLineFromSidesSearchLog?.search(
              ContestImageTypes.BottomLine
            ),
          })
        }
      }

      if (contestBoxRightLineParts.length > 0) {
        const sortedRightSideParts = [...contestBoxRightLineParts].sort(
          (a, b) => b.y - a.y
        )

        if (sortedRightSideParts[1]) {
          bottomStrokeRightSidePart = findStroke({
            imageData: ballotImage,
            searchDirection: 'down',
            bounds: rect({
              left: sortedRightSideParts[1].x - 51,
              top: sortedRightSideParts[1].y,
              right: sortedRightSideParts[1].x - 1,
              bottom:
                sortedRightSideParts[1].y + sortedRightSideParts[1].height * 3,
            }),
            minThickness: 2,
            maxThickness: 10,
            log: bottomLineFromSidesSearchLog?.search(
              ContestImageTypes.BottomLine
            ),
          })
        }
      }

      const bottomStrokePartsFromSides =
        bottomStrokeLeftSidePart &&
        (!bottomStrokeRightSidePart ||
          computeAreaFill(ballotImage, bottomStrokeLeftSidePart) >
            computeAreaFill(ballotImage, bottomStrokeRightSidePart))
          ? [
              bottomStrokeLeftSidePart,
              ...followStroke({
                imageData: ballotImage,
                bounds: rect({
                  left: bottomStrokeLeftSidePart.x,
                  top: contestBoxTopLine.y + contestBoxTopLine.height,
                  right:
                    contestBoxRightLineParts.length > 0
                      ? Math.max(
                          ...contestBoxRightLineParts.map(({ x }) => x)
                        ) + bottomStrokeLeftSidePart.width
                      : ballotImage.width - 1,
                  bottom:
                    lowestSideLinePartY +
                    (contestBoxLeftLineParts[0] ?? contestBoxRightLineParts[0])
                      .height,
                }),
                searchDirection: 'right',
                strokeBounds: bottomStrokeLeftSidePart,
                log: bottomLineFromSidesSearchLog?.search(
                  ContestImageTypes.BottomLine
                ),
              }),
            ]
          : bottomStrokeRightSidePart
          ? [
              bottomStrokeRightSidePart,
              ...followStroke({
                imageData: ballotImage,
                bounds: rect({
                  left:
                    contestBoxLeftLineParts.length > 0
                      ? Math.min(...contestBoxLeftLineParts.map(({ x }) => x)) -
                        bottomStrokeRightSidePart.width
                      : 0,
                  right: bottomStrokeRightSidePart.x - 1,
                  top: contestBoxTopLine.y + contestBoxTopLine.height,
                  bottom:
                    lowestSideLinePartY +
                    (contestBoxLeftLineParts[0] ?? contestBoxRightLineParts[0])
                      .height,
                }),
                searchDirection: 'left',
                strokeBounds: bottomStrokeRightSidePart,
                log: bottomLineFromSidesSearchLog?.search(
                  ContestImageTypes.BottomLine
                ),
              }),
            ]
          : undefined

      const bounds = rect({
        left: contestBoxTopLine.x,
        top: lowestSideLinePartY,
        right: contestBoxTopLine.x + contestBoxTopLine.width - 1,
        bottom:
          lowestSideLinePartY +
          (contestBoxLeftLineParts[0] ?? contestBoxRightLineParts[0]).height,
      })
      const contestBoxBottomLineFromBelow = findStroke({
        imageData: ballotImage,
        bounds,
        minThickness: 2,
        maxThickness: 10,
        searchDirection: 'up',
        log: bottomLineFromBelowSearchLog?.search(ContestImageTypes.BottomLine),
      })
      const contestBoxBottomLinePartsFromBelow: Rect[] = []

      if (contestBoxBottomLineFromBelow) {
        contestBoxBottomLinePartsFromBelow.push(contestBoxBottomLineFromBelow)

        for (const part of followStroke({
          imageData: ballotImage,
          bounds: {
            x: 0,
            y: 0,
            width: ballotImage.width,
            height: ballotImage.height,
          },
          strokeBounds: {
            ...contestBoxBottomLineFromBelow,
            width: 15,
          },
          searchDirection: 'left',
          log: bottomLineFromBelowSearchLog?.search(
            ContestImageTypes.BottomLine
          ),
        })) {
          contestBoxBottomLinePartsFromBelow.push(part)
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
            ...contestBoxBottomLineFromBelow,
            x:
              contestBoxBottomLineFromBelow.x +
              contestBoxBottomLineFromBelow.width -
              15,
            width: 15,
          },
          searchDirection: 'right',
          log: bottomLineFromBelowSearchLog?.search(
            ContestImageTypes.BottomLine
          ),
        })) {
          contestBoxBottomLinePartsFromBelow.push(part)
        }
      }

      if (bottomStrokePartsFromSides) {
        const contestBoxBottomLineFromSidesStrokeFill = bottomStrokePartsFromSides.reduce(
          (fill, part) => fill + computeAreaFill(ballotImage, part),
          0
        )
        const contestBoxBottomLineFromBelowStrokeFill = contestBoxBottomLinePartsFromBelow.reduce(
          (fill, part) => fill + computeAreaFill(ballotImage, part),
          0
        )

        if (
          contestBoxBottomLineFromBelowStrokeFill >
          contestBoxBottomLineFromSidesStrokeFill
        ) {
          contestBoxBottomLineParts = contestBoxBottomLinePartsFromBelow
          bottomLineFromBelowSearchLog?.commit('bottom line found from below')
          bottomLineFromSidesSearchLog?.cancel(
            'not using bottom line from sides'
          )
        } else {
          contestBoxBottomLineParts = bottomStrokePartsFromSides
          bottomLineFromSidesSearchLog?.commit('bottom line found from sides')
          bottomLineFromBelowSearchLog?.cancel(
            'not using bottom line from below'
          )
        }
      } else {
        contestBoxBottomLineParts = contestBoxBottomLinePartsFromBelow
        bottomLineFromBelowSearchLog?.commit('bottom line found from below')
        bottomLineFromSidesSearchLog?.cancel('not using bottom line from sides')
      }
    }

    const boundsPadding = 0
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
      rect({ left, top, right, bottom })
    )

    const edges: Edges = {
      left: findEdgeWithin(ballotImage, contestBoxTopLineParts, 'left'),
      top: findEdgeWithin(ballotImage, contestBoxTopLineParts, 'top'),
      right: findEdgeWithin(ballotImage, contestBoxRightLineParts, 'right'),
      bottom: findEdgeWithin(ballotImage, contestBoxBottomLineParts, 'bottom'),
    }
    const corners = getCorners({
      bounds: contestBounds,
      edges,
    })

    for (const [comment, corner] of zip(
      ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      corners
    )) {
      clog?.landmark(
        ContestImageTypes.Corner,
        { ...corner, width: 1, height: 1 },
        comment
      )
    }

    contestShapes.push({
      bounds: contestBounds,
      corners,
    })

    if ('draw'.includes('nope')) {
      fill(ballotImage, contestBounds, [0, 0xff, 0, 0x66])

      if (contestBoxTopLine) {
        fill(ballotImage, contestBoxTopLine, [0, 0xff, 0xff, 0x66])
      }

      for (const [i, part] of contestBoxTopLineParts.entries()) {
        fill(ballotImage, part, [
          0xff,
          (i % 2) * 0xff,
          ((i + 1) % 2) * 0xff,
          0x60,
        ])
      }
      for (const [i, part] of contestBoxLeftLineParts.entries()) {
        fill(ballotImage, part, [(i % 2) * 0xff, ((i + 1) % 2) * 0xff, 0, 0x66])
      }
      for (const [i, part] of contestBoxRightLineParts.entries()) {
        fill(ballotImage, part, [(i % 2) * 0xff, ((i + 1) % 2) * 0xff, 0, 0x66])
      }

      if (contestBoxBottomLine) {
        fill(ballotImage, contestBoxBottomLine, [0, 0xff, 0xff, 0x60])
      }

      for (const [i, part] of contestBoxBottomLineParts.entries()) {
        fill(ballotImage, part, [
          0xff,
          (i % 2) * 0xff,
          ((i + 1) % 2) * 0xff,
          0x60,
        ])
      }

      for (const corner of corners) {
        drawTarget(ballotImage, corner, [0xff, 0, 0, 0x66], 25)
      }
    }

    clog?.end()
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
