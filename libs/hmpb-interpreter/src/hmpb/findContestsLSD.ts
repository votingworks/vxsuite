import lsd from '@votingworks/lsd'
import { Rect } from '../types'
import {
  closeBoxSegmentGaps,
  drawBoxes,
  filterContainedBoxes,
  filterInBounds,
  findBoxes,
  gridSegment,
  GridSegment,
  inferBoxFromPartial,
  isCompleteBox,
  Layout,
  matchTemplateLayout,
  mergeAdjacentLineSegments,
  scaleBox,
  splitIntoColumns,
} from '../utils/box'
import { rectClip, rectInset, rectScale } from '../utils/geometry'
import { canvas, ImageDebug, QuickCanvas } from '../utils/images'
import { setFilter, setMap } from '../utils/set'

function layoutBounds(layout: Layout): Rect {
  const firstColumn = layout.columns[0]
  const lastColumn = layout.columns[layout.columns.length - 1]
  const minX = firstColumn.reduce(
    (minX, box) => Math.min(minX, box.left.start.x, box.left.end.x),
    Infinity
  )
  const maxX = lastColumn.reduce(
    (maxX, box) => Math.max(maxX, box.right.start.x, box.right.end.x),
    0
  )
  const minY = layout.columns
    .map((column) => column[0])
    .reduce(
      (minY, firstBoxInColumn) =>
        Math.min(
          minY,
          firstBoxInColumn.top.start.y,
          firstBoxInColumn.top.end.y
        ),
      Infinity
    )
  const maxY = layout.columns
    .map((column) => column[column.length - 1])
    .reduce(
      (maxY, lastBoxInColumn) =>
        Math.max(
          maxY,
          lastBoxInColumn.bottom.start.y,
          lastBoxInColumn.bottom.end.y
        ),
      0
    )
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function toGray(imageData: ImageData): ImageData {
  const src32 = new Int32Array(imageData.data.buffer)
  const dst = new Uint8ClampedArray(imageData.width * imageData.height)

  for (let offset = 0, size = src32.length; offset < size; offset++) {
    const px = src32[offset]
    const r = px & 0xff
    const g = (px >>> 8) & 0xff
    const b = (px >>> 16) & 0xff

    // Luminosity grayscale formula.
    const luminosity = (0.21 * r + 0.72 * g + 0.07 * b) | 0
    dst[offset] = luminosity
  }

  return {
    data: dst,
    width: imageData.width,
    height: imageData.height,
  }
}

function drawSegments(
  segments: Iterable<GridSegment>
): (canvas: QuickCanvas) => void {
  return (canvas) => {
    for (const { start, end, direction } of segments) {
      canvas.line(start, end, {
        color:
          direction === 'up'
            ? 'green'
            : direction === 'down'
            ? 'yellow'
            : direction === 'right'
            ? 'blue'
            : 'red',
      })
    }
  }
}

function findLineSegments(imageData: ImageData): GridSegment[] {
  return lsd(imageData).map(({ x1, y1, x2, y2 }) =>
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
  imageData: ImageData,
  segments: readonly GridSegment[]
): ReturnType<typeof findBoxes> {
  const parallelThreshold = imageData.width * 2
  const maxConnectedCornerDistance = 0.01 * imageData.width
  const maxConnectedSegmentGap = 0.01 * imageData.width
  const result = findBoxes(
    mergeAdjacentLineSegments(segments, {
      parallelThreshold,
      maxConnectedSegmentGap,
    }),
    {
      maxConnectedCornerDistance,
      parallelThreshold,
    }
  )
  return result
}

export function findTemplateContests(
  imageData: ImageData,
  { minBoxEdgeSegmentLength = imageData.width * 0.1 } = {}
): Layout {
  const gray = toGray(imageData)
  const boxes = setMap(
    filterContainedBoxes(
      setFilter(
        setMap(
          analyzeLineSegments(
            gray,
            filterLineSegments(findLineSegments(gray), {
              minLength: minBoxEdgeSegmentLength,
            })
          ).clockwise,
          (box) => inferBoxFromPartial(box) ?? box
        ),
        isCompleteBox
      )
    ),
    closeBoxSegmentGaps
  )
  return {
    width: imageData.width,
    height: imageData.height,
    columns: splitIntoColumns(boxes),
  }
}

export function findScanLayout(
  imageData: ImageData,
  {
    templateLayout,
    minBoxEdgeSegmentLength = imageData.width * 0.1,
    imdebug: dbg,
  }: {
    templateLayout: Layout
    minBoxEdgeSegmentLength?: number
    imdebug?: ImageDebug
  }
): Layout | undefined {
  const width = 1060
  const height = 1750
  const scaled = canvas().drawImage(imageData, 0, 0, width, height).render()
  const segments = findLineSegments(toGray(scaled))
  dbg?.('all line segments').background(imageData).tap(drawSegments(segments))

  const filteredSegments = filterLineSegments(segments, {
    minLength: minBoxEdgeSegmentLength,
  })
  dbg?.('filtered line segments')
    .background(imageData)
    .tap(drawSegments(filteredSegments))

  const analysis = analyzeLineSegments(scaled, filteredSegments)
  const scaledBoxes = [...analysis.clockwise, ...analysis.counterClockwise]
  dbg?.('downscaled boxes').background(scaled).tap(drawBoxes(scaledBoxes))

  const originalScaleBoxes = scaledBoxes.map((box) =>
    scaleBox(imageData.width / width, box)
  )
  dbg?.('original scale boxes')
    .background(imageData)
    .tap(drawBoxes(originalScaleBoxes))

  const fullBoxes = originalScaleBoxes.map(
    (box) => inferBoxFromPartial(box) ?? box
  )
  dbg?.('boxes with inferred edges')
    .background(imageData)
    .tap(drawBoxes(fullBoxes))

  const gaplessBoxes = fullBoxes.map((box) =>
    isCompleteBox(box) ? closeBoxSegmentGaps(box) : box
  )
  dbg?.('boxes with corner gaps closed')
    .background(imageData)
    .tap(drawBoxes(gaplessBoxes))

  const completeBoxes = gaplessBoxes.filter(isCompleteBox)
  dbg?.('only complete 4-edge boxes')
    .background(imageData)
    .tap(drawBoxes(completeBoxes))

  const templateLayoutBounds = layoutBounds(templateLayout)
  const boundsBuffer = imageData.width * 0.05
  const scanLayoutBounds: Rect = rectClip(
    rectInset(
      rectScale(templateLayoutBounds, imageData.width / templateLayout.width),
      -boundsBuffer
    ),
    { x: 0, y: 0, width: imageData.width, height: imageData.height }
  )
  const insideTemplateLayoutBoxes = filterInBounds(completeBoxes, {
    bounds: scanLayoutBounds,
  })
  dbg?.('filtering-template-bounds')
    .background(imageData)
    .rect(
      scanLayoutBounds.x,
      scanLayoutBounds.y,
      scanLayoutBounds.width,
      scanLayoutBounds.height,
      { color: 'cyan' }
    )
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
  dbg?.('filtering edge boxes')
    .background(imageData)
    .rect(edgeBounds.x, edgeBounds.y, edgeBounds.width, edgeBounds.height, {
      color: 'cyan',
    })
    .tap(drawBoxes(insideEdgeBoundsBoxes))

  const withoutContainedBoxes = filterContainedBoxes(insideEdgeBoundsBoxes)
  dbg?.('filtering boxes contained within another')
    .background(imageData)
    .tap(drawBoxes(withoutContainedBoxes))

  const withoutContainedBoxesNoEdgeFilter = filterContainedBoxes(
    insideTemplateLayoutBoxes
  )
  dbg?.('filtering boxes contained within another (no edge filter)')
    .background(imageData)
    .tap(drawBoxes(withoutContainedBoxesNoEdgeFilter))

  const fixedScanLayout =
    matchTemplateLayout(templateLayout, {
      width: imageData.width,
      height: imageData.height,
      columns: splitIntoColumns(withoutContainedBoxes),
    }) ||
    matchTemplateLayout(templateLayout, {
      width: imageData.width,
      height: imageData.height,
      columns: splitIntoColumns(withoutContainedBoxesNoEdgeFilter),
    })
  return fixedScanLayout
}
