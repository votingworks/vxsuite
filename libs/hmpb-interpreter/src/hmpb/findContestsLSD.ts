import { grayscale } from '@votingworks/image-utils'
import lsd from '@votingworks/lsd'
import { performance } from 'perf_hooks'
import { Rect, Size } from '../types'
import {
  boxCorners,
  closeBoxSegmentGaps,
  Direction,
  filterContainedBoxes,
  filterInBounds,
  findBoxes,
  GridBox,
  GridSegment,
  gridSegment,
  inferBoxFromPartial,
  isCompleteBox,
  Layout,
  matchTemplateLayout,
  mergeAdjacentLineSegments,
  scaleLineSegment,
  splitIntoColumns,
} from '../utils/box'
import { createImageData } from '../utils/canvas'
import {
  rectClip,
  rectContainingPoints,
  rectInset,
  rectScale,
} from '../utils/geometry'
import { ImageDebug, QuickCanvas, resample } from '../utils/images'

function toGray(imageData: ImageData): ImageData {
  performance.mark('toGray start')
  const gray = createImageData(
    new Uint8ClampedArray(imageData.width * imageData.height),
    imageData.width,
    imageData.height
  )
  grayscale(imageData, gray)
  performance.mark('toGray end')
  performance.measure('toGray', 'toGray start', 'toGray end')
  return gray
}

function findLineSegments(
  imageData: ImageData,
  { scale }: { scale?: number } = {}
): GridSegment[] {
  return lsd(imageData, { scale }).map(({ x1, y1, x2, y2 }) =>
    gridSegment({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 } })
  )
}

function filterLineSegments(
  segments: readonly GridSegment[],
  { minLength }: { minLength: number }
) {
  return segments.filter(({ length }) => length >= minLength)
}

function analyzeLineSegments(
  size: Size,
  segments: readonly GridSegment[]
): ReturnType<typeof findBoxes> {
  const parallelThreshold = size.width * 2
  const maxConnectedCornerDistance = 0.01 * size.width
  const maxConnectedSegmentGap = 0.01 * size.width
  return findBoxes(
    mergeAdjacentLineSegments(segments, {
      parallelThreshold,
      maxConnectedSegmentGap,
    }),
    {
      maxConnectedCornerDistance,
      parallelThreshold,
    }
  )
}

const DEFAULT_MIN_SEGMENT_LENGTH_TO_IMAGE_WIDTH_RATIO = 0.1

function directionColor(direction: Direction): string {
  return direction === 'up'
    ? 'green'
    : direction === 'down'
    ? 'yellow'
    : direction === 'right'
    ? 'blue'
    : 'red'
}

export function drawBounds({
  x,
  y,
  width,
  height,
}: Rect): (canvas: QuickCanvas) => void {
  return (canvas) => canvas.rect(x, y, width, height, { color: 'cyan' })
}

export function drawUnusedSegments(
  unusedSegments: Iterable<GridSegment>
): (canvas: QuickCanvas) => void {
  return drawLineSegments(unusedSegments, () => 'pink')
}

export function drawLineSegments(
  segments: Iterable<GridSegment>,
  colorize = directionColor
): (canvas: QuickCanvas) => void {
  return (canvas) => {
    for (const { start, end, direction } of segments) {
      canvas.line(start, end, { color: colorize(direction) })
    }
  }
}

export function drawBoxes(
  boxes: Iterable<Partial<GridBox>>,
  { stroke, color: overrideColor }: { stroke?: number; color?: string } = {}
): (qc: QuickCanvas) => void {
  const colors = [
    'red',
    'orange',
    'yellow',
    'green',
    'blue',
    'indigo',
    'violet',
    'black',
  ]
  return (canvas) => {
    const inferredDash = [10, 10]
    for (const [i, box] of [...boxes].entries()) {
      const color = overrideColor ?? colors[i % colors.length]
      if (box.top) {
        canvas.line(box.top.start, box.top.end, {
          color,
          stroke,
          dash: box.top.inferred ? inferredDash : undefined,
        })
      }
      if (box.right) {
        canvas.line(box.right.start, box.right.end, {
          color,
          stroke,
          dash: box.right.inferred ? inferredDash : undefined,
        })
      }
      if (box.bottom) {
        canvas.line(box.bottom.start, box.bottom.end, {
          color,
          stroke,
          dash: box.bottom.inferred ? inferredDash : undefined,
        })
      }
      if (box.left) {
        canvas.line(box.left.start, box.left.end, {
          color,
          stroke,
          dash: box.left.inferred ? inferredDash : undefined,
        })
      }
    }

    return canvas
  }
}

export function drawLayout(layout: Layout): (canvas: QuickCanvas) => void {
  return (canvas) => {
    for (const column of layout.columns) {
      const left = Math.min(
        ...column.flatMap(({ left }) => [left.start.x, left.end.x])
      )
      const top = Math.min(
        ...column.flatMap(({ top }) => [top.start.y, top.end.y])
      )
      const right = Math.max(
        ...column.flatMap(({ right }) => [right.start.x, right.end.x])
      )
      const bottom = Math.max(
        ...column.flatMap(({ bottom }) => [bottom.start.y, bottom.end.y])
      )
      canvas.rect(left, top, right - left + 1, bottom - top + 1, {
        stroke: 10,
        color: 'green',
      })
      drawBoxes(column)(canvas)
    }
  }
}

function layoutBounds(layout: Layout): Rect {
  return rectContainingPoints(layout.columns.flat().map(boxCorners).flat(), {
    subpixel: true,
  })
}

/**
 * Determine the layout of contests in a template image.
 */
export function findTemplateContests(
  imageData: ImageData,
  {
    minSegmentLength,
    imdebug,
  }: { minSegmentLength?: number; imdebug?: ImageDebug } = {}
): Layout {
  performance.mark('findTemplateContests start')
  const { boxes: completeBoxes } = findContests(imageData, {
    minSegmentLength,
    imdebug,
  })
  const boxes = filterContainedBoxes(completeBoxes)
  imdebug?.('without contained boxes')
    .background(imageData)
    .tap(drawBoxes(boxes))
  const layout: Layout = {
    columns: splitIntoColumns(boxes),
    width: imageData.width,
    height: imageData.height,
  }
  imdebug?.('full layout').background(imageData).tap(drawLayout(layout))
  performance.mark('findTemplateContests end')
  performance.measure(
    'findTemplateContests',
    'findTemplateContests start',
    'findTemplateContests end'
  )
  return layout
}

function findContests(
  imageData: ImageData,
  {
    scale = Math.min(1060, imageData.width) / imageData.width,
    minSegmentLength = imageData.width *
      DEFAULT_MIN_SEGMENT_LENGTH_TO_IMAGE_WIDTH_RATIO,
    imdebug,
  }: {
    scale?: number
    minSegmentLength?: number
    imdebug?: ImageDebug
  }
): { boxes: Iterable<GridBox>; unusedSegments: Iterable<GridSegment> } {
  performance.mark('findContests start')
  const u8ScaledImageData = toGray(
    resample(imageData, {
      width: imageData.width * scale,
      height: imageData.height * scale,
    })
  )

  // Image → line segments
  const allLineSegments = findLineSegments(u8ScaledImageData, {
    scale: 1,
  }).map((segment) => scaleLineSegment(1 / scale, 1 / scale, segment))
  imdebug?.('all line segments')
    .background(imageData)
    .tap(drawLineSegments(allLineSegments))
  const longLineSegments = filterLineSegments(allLineSegments, {
    minLength: minSegmentLength,
  })
  imdebug?.('long line segments')
    .background(imageData)
    .tap(drawLineSegments(longLineSegments))

  // Line segments → partial boxes
  const findLineSegmentsResult = analyzeLineSegments(
    imageData,
    longLineSegments
  )
  imdebug?.('initial boxes')
    .background(imageData)
    .tap(drawUnusedSegments(findLineSegmentsResult.unusedSegments))
    .tap(drawBoxes(findLineSegmentsResult.clockwise))
    .tap(drawBoxes(findLineSegmentsResult.counterClockwise))

  // Partial boxes → complete boxes
  const { boxes: inferredBoxes, unusedSegments } = [
    ...findLineSegmentsResult.clockwise,
    ...findLineSegmentsResult.counterClockwise,
  ].reduce<{ boxes: GridBox[]; unusedSegments: ReadonlySet<GridSegment> }>(
    ({ boxes, unusedSegments }, box) => {
      const inferred = inferBoxFromPartial(box, unusedSegments)
      return inferred
        ? {
            boxes: [...boxes, inferred.box],
            unusedSegments: inferred.unusedSegments,
          }
        : { boxes, unusedSegments }
    },
    { boxes: [], unusedSegments: findLineSegmentsResult.unusedSegments }
  )
  imdebug?.('with inferred box edges')
    .background(imageData)
    .tap(drawUnusedSegments(unusedSegments))
    .tap(drawBoxes(inferredBoxes))
  const gaplessBoxes = inferredBoxes.map((box) =>
    isCompleteBox(box) ? closeBoxSegmentGaps(box) : box
  )
  imdebug?.('closed box corner gaps')
    .background(imageData)
    .tap(drawBoxes(gaplessBoxes))
  const completeBoxes = gaplessBoxes.filter(isCompleteBox)
  imdebug?.('only complete boxes')
    .background(imageData)
    .tap(drawBoxes(completeBoxes))
  performance.mark('findContests end')
  performance.measure('findContests', 'findContests start', 'findContests end')
  return { boxes: completeBoxes, unusedSegments }
}

/**
 * Determine the layout of contests in a scanned ballot image based on an
 * expected matching template layout.
 */
export function findBallotContests(
  imageData: ImageData,
  {
    templateLayout,
    minSegmentLength,
    imdebug,
  }: {
    templateLayout: Layout
    minSegmentLength?: number
    imdebug?: ImageDebug
  }
): Layout | undefined {
  performance.mark('findBallotContests start')
  const { boxes: completeBoxes, unusedSegments } = findContests(imageData, {
    minSegmentLength,
    imdebug,
  })

  // Filter outliers
  const templateLayoutBounds = layoutBounds(templateLayout)
  const boundsBuffer = imageData.width * 0.05
  const scanLayoutBounds = rectClip(
    rectInset(
      rectScale(templateLayoutBounds, imageData.width / templateLayout.width),
      -boundsBuffer
    ),
    { x: 0, y: 0, width: imageData.width, height: imageData.height }
  )
  const insideTemplateLayoutBoxes = filterInBounds(completeBoxes, {
    bounds: scanLayoutBounds,
  })
  imdebug?.('only boxes inside template contest area')
    .background(imageData)
    .tap(drawBounds(scanLayoutBounds))
    .tap(drawBoxes(insideTemplateLayoutBoxes))
  const edgeSize = imageData.width * 0.015
  const edgeBounds: Rect = {
    x: edgeSize,
    y: edgeSize,
    width: imageData.width - 2 * edgeSize,
    height: imageData.height - 2 * edgeSize,
  }
  const insideEdgeBoundsBoxes = filterInBounds(insideTemplateLayoutBoxes, {
    bounds: edgeBounds,
  })
  imdebug?.('only boxes far enough away from the edge')
    .background(imageData)
    .tap(drawBounds(edgeBounds))
    .tap(drawBoxes(insideEdgeBoundsBoxes))

  // Filter contained boxes
  const withoutContainedBoxes = filterContainedBoxes(insideEdgeBoundsBoxes)
  imdebug?.('without contained boxes')
    .background(imageData)
    .tap(drawBoxes(withoutContainedBoxes))

  // Match template
  const candidateScanLayoutWithEdgeFiltering: Layout = {
    width: imageData.width,
    height: imageData.height,
    columns: splitIntoColumns(withoutContainedBoxes),
  }
  imdebug?.('candidate scan layout without edge filtering')
    .background(imageData)
    .tap(drawLayout(candidateScanLayoutWithEdgeFiltering))
  let scanLayout = matchTemplateLayout(
    templateLayout,
    candidateScanLayoutWithEdgeFiltering,
    unusedSegments
  )

  if (!scanLayout) {
    const candidateScanLayoutWithoutEdgeFiltering: Layout = {
      width: imageData.width,
      height: imageData.height,
      columns: splitIntoColumns(
        filterContainedBoxes(insideTemplateLayoutBoxes)
      ),
    }
    imdebug?.('candidate scan layout without edge filtering')
      .background(imageData)
      .tap(drawLayout(candidateScanLayoutWithoutEdgeFiltering))
    scanLayout = matchTemplateLayout(
      templateLayout,
      candidateScanLayoutWithoutEdgeFiltering,
      unusedSegments
    )
  }

  if (scanLayout) {
    imdebug?.('matched scan layout')
      .background(imageData)
      .tap(drawLayout(scanLayout))
  }

  performance.mark('findBallotContests end')
  performance.measure(
    'findBallotContests',
    'findBallotContests start',
    'findBallotContests end'
  )
  return scanLayout
}
