import { LineSegment } from '@votingworks/lsd'
import {
  euclideanDistance,
  poly4Area,
  rectContains,
  vectorAdd,
  vectorScale,
  vectorSub,
} from './geometry'
import { QuickCanvas } from './images'
import { Corners, Offset, Point, Rect } from '../types'
import { setFilter } from './set'
import { zip } from './iterators'

interface BoxOf<Type> {
  top: Type
  right: Type
  bottom: Type
  left: Type
}

export interface GridSegment {
  readonly direction: Direction
  readonly start: Point
  readonly end: Point
  readonly length: number
}

export type Box = BoxOf<LineSegment>
export type AnnotatedBox = BoxOf<AnnotatedSegment>
export type GridBox = BoxOf<GridSegment>

export type LayoutColumn = readonly GridBox[]

export interface Layout {
  readonly width: number
  readonly height: number
  readonly columns: readonly LayoutColumn[]
}

type Direction = 'right' | 'left' | 'up' | 'down'

interface AnnotatedSegment {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly angle: number
  readonly direction: Direction
  readonly min: Point
  readonly max: Point
}

export interface Rotation {
  readonly angle: number
  readonly matchedSegments: readonly GridSegment[]
}

const TWO_PI = 2 * Math.PI

export function gridSegment({
  start,
  end,
}: {
  start: Point
  end: Point
}): GridSegment {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return {
    start,
    end,
    length: euclideanDistance(start, end),
    direction:
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? 'right'
          : 'left'
        : dy > 0
        ? 'down'
        : 'up',
  }
}

/**
 * Turns right if `a` + 90° ≈ `b`.
 */
function isSameAngle(
  a: number,
  b: number,
  { allowedDelta = (2 / 180) * Math.PI } = {}
): boolean {
  const ap = (a + TWO_PI) % TWO_PI
  const bp = (b + TWO_PI) % TWO_PI
  const diff = (bp - ap + TWO_PI) % TWO_PI
  return diff <= allowedDelta
}

export function scaleLineSegment(
  scale: number,
  segment: GridSegment
): GridSegment {
  return gridSegment({
    start: vectorScale(segment.start, scale),
    end: vectorScale(segment.end, scale),
  })
}

function computeSegmentAngle({ start, end }: GridSegment): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return Math.atan2(dy, dx)
}

export function scaleBox(
  scale: number,
  box: Partial<GridBox>
): Partial<GridBox> {
  return {
    top: box.top && scaleLineSegment(scale, box.top),
    right: box.right && scaleLineSegment(scale, box.right),
    bottom: box.bottom && scaleLineSegment(scale, box.bottom),
    left: box.left && scaleLineSegment(scale, box.left),
  }
}

export function findRotation(
  segments: readonly GridSegment[],
  { sameDiffThreshold = (1 / 180) * Math.PI } = {}
): Rotation | undefined {
  const rightward = Math.atan2(0, 1)
  const leftward = Math.atan2(0, -1)
  const downward = Math.atan2(1, 0)
  const upward = Math.atan2(-1, 0)
  const annotated: { diff: number; segment: GridSegment }[] = []

  for (const segment of segments) {
    const angle = computeSegmentAngle(segment)
    let diff: number

    const rdiff = Math.abs(rightward - angle)
    const udiff = Math.abs(upward - angle)
    const ldiff = Math.abs(leftward - angle)
    const ddiff = Math.abs(downward - angle)

    if (rdiff < udiff && rdiff < ldiff && rdiff < ddiff) {
      diff = angle - rightward
    } else if (ldiff < udiff && ldiff < rdiff && ldiff < ddiff) {
      diff = angle - leftward
    } else if (udiff < ldiff && udiff < rdiff && udiff < ddiff) {
      diff = angle - upward
    } else {
      diff = angle - downward
    }

    annotated.push({
      diff,
      segment,
    })
  }

  const grouped = [...annotated]
    .sort(({ diff: a }, { diff: b }) => a - b)
    .reduce<{ diff: number; segment: GridSegment }[][]>(
      (out, { diff, segment }, i, sorted) => {
        out[out.length - 1].push({ diff, segment })
        if (
          sorted[i + 1] &&
          Math.abs(sorted[i + 1].diff - diff) > sameDiffThreshold
        ) {
          out.push([])
        }
        return out
      },
      [[]]
    )

  const largestGroup = grouped.reduce(
    (largest, group) => (group.length > largest.length ? group : largest),
    []
  )
  const angle =
    largestGroup.reduce((sum, { diff }) => sum + diff, 0) / largestGroup.length
  return {
    angle,
    matchedSegments: largestGroup.map(({ segment }) => segment),
  }
}

function groupBy<Key extends string, Element>(
  elements: Iterable<Element>,
  keyfn: (element: Element) => Key
): Record<Key, Element[] | undefined> {
  const result = {} as Record<Key, Element[] | undefined>

  for (const element of elements) {
    const key = keyfn(element)
    const value = (result[key] ??= new Array<Element>())
    value.push(element)
  }

  return result
}

export function findBoxes(
  segments: readonly GridSegment[],
  {
    maxConnectedCornerDistance,
    parallelThreshold,
  }: { maxConnectedCornerDistance: number; parallelThreshold: number }
): {
  clockwise: ReturnType<typeof findBoxesFromSegments>
  counterClockwise: ReturnType<typeof findBoxesFromSegments>
} {
  const rotation = findRotation(segments)

  if (!rotation) {
    return {
      clockwise: new Set(),
      counterClockwise: new Set(),
    }
  }

  const { up = [], down = [], left = [], right = [] } = groupBy(
    rotation.matchedSegments,
    ({ direction }) => direction
  )

  const clockwise = findBoxesFromSegments({
    up,
    down,
    left,
    right,
    parallelThreshold,
    maxConnectedCornerDistance,
  })

  const counterClockwise = findBoxesFromSegments({
    up: invertSegments(down),
    down: invertSegments(up),
    left: invertSegments(right),
    right: invertSegments(left),
    parallelThreshold,
    maxConnectedCornerDistance,
  })

  return { clockwise, counterClockwise }
}

function invertSegments(segments: readonly GridSegment[]): GridSegment[] {
  return segments.map(({ start, end, length, direction }) => ({
    start: end,
    end: start,
    length,
    direction:
      direction === 'up'
        ? 'down'
        : direction === 'down'
        ? 'up'
        : direction === 'left'
        ? 'right'
        : 'left',
  }))
}

function findBoxesFromSegments({
  up,
  down,
  left,
  right,
  parallelThreshold,
  maxConnectedCornerDistance,
}: {
  up: GridSegment[]
  down: GridSegment[]
  left: GridSegment[]
  right: GridSegment[]
  parallelThreshold: number
  maxConnectedCornerDistance: number
}): Set<Partial<GridBox>> {
  const builder = new BoxesBuilder({ parallelThreshold })
  for (const r of right) {
    for (const u of up) {
      const dist = euclideanDistance(r.start, u.end)
      if (dist <= maxConnectedCornerDistance) {
        builder.addCorner({ left: u, top: r })
      }
    }
  }

  for (const r of right) {
    for (const d of down) {
      const dist = euclideanDistance(r.end, d.start)
      if (dist <= maxConnectedCornerDistance) {
        builder.addCorner({ top: r, right: d })
      }
    }
  }

  for (const l of left) {
    for (const d of down) {
      const dist = euclideanDistance(l.start, d.end)
      if (dist <= maxConnectedCornerDistance) {
        builder.addCorner({ right: d, bottom: l })
      }
    }
  }

  for (const l of left) {
    for (const u of up) {
      const dist = euclideanDistance(l.end, u.start)
      if (dist <= maxConnectedCornerDistance) {
        builder.addCorner({ bottom: l, left: u })
      }
    }
  }

  return builder.build()
}

/**
 * Builds `Box` instances by joining line segments at corners.
 */
class BoxesBuilder {
  private readonly segmentBoxMap = new Map<GridSegment, Partial<GridBox>>()
  private readonly parallelThreshold: number

  public constructor({ parallelThreshold }: { parallelThreshold: number }) {
    this.parallelThreshold = parallelThreshold
  }

  /**
   * Get the boxes which are associated with the given `segments`.
   */
  private getBoxesForSegments(
    segments: readonly GridSegment[]
  ): Set<Partial<GridBox>> {
    return new Set(
      segments
        .map((s) => this.segmentBoxMap.get(s))
        .filter((b): b is Partial<GridBox> => !!b)
    )
  }

  /**
   * Add a corner to join two segments together. If these segments are
   * previously unknown, a new `Box` will be created for them. If one or both
   * of them are previously known, the associated box(es) will be merged. If
   * the boxes cannot be merged they will be ignored.
   */
  public addCorner(segments: { left: GridSegment; top: GridSegment }): void
  public addCorner(segments: { top: GridSegment; right: GridSegment }): void
  public addCorner(segments: { right: GridSegment; bottom: GridSegment }): void
  public addCorner(segments: { bottom: GridSegment; left: GridSegment }): void
  public addCorner(box: Partial<GridBox>): void {
    const segments = getBoxSegments(box)
    const boxes = this.getBoxesForSegments(segments)
    const merged = [...boxes].reduce<Partial<GridBox> | undefined>(
      (previous, current) => previous && this.mergeBoxes(previous, current),
      box
    )

    for (const box of boxes) {
      for (const segment of getBoxSegments(box)) {
        this.segmentBoxMap.delete(segment)
      }
    }

    if (merged) {
      for (const segment of getBoxSegments(merged)) {
        this.segmentBoxMap.set(segment, merged)
      }
    }
  }

  /**
   * Merges boxes `a` and `b` if there is no conflict.
   */
  private mergeBoxes(
    a: Partial<GridBox>,
    b: Partial<GridBox>
  ): Partial<GridBox> | undefined {
    const { parallelThreshold } = this
    let top: GridSegment | undefined
    let right: GridSegment | undefined
    let bottom: GridSegment | undefined
    let left: GridSegment | undefined

    if (a.top && b.top && a.top !== b.top) {
      if (
        computeProjectedLineIntersection(a.top, b.top, {
          parallelThreshold,
        }) === 'colinear'
      ) {
        top =
          a.top.start.x < b.top.start.x
            ? gridSegment({ start: a.top.start, end: b.top.end })
            : gridSegment({ start: b.top.start, end: a.top.end })
      } else {
        return undefined
      }
    } else {
      top = a.top ?? b.top
    }

    if (a.right && b.right && a.right !== b.right) {
      if (
        computeProjectedLineIntersection(a.right, b.right, {
          parallelThreshold,
        }) === 'colinear'
      ) {
        right =
          a.right.start.y < b.right.start.y
            ? gridSegment({ start: a.right.start, end: b.right.end })
            : gridSegment({ start: b.right.start, end: a.right.end })
      } else {
        return undefined
      }
    } else {
      right = a.right ?? b.right
    }

    if (a.bottom && b.bottom && a.bottom !== b.bottom) {
      if (
        computeProjectedLineIntersection(a.bottom, b.bottom, {
          parallelThreshold,
        }) === 'colinear'
      ) {
        bottom =
          a.bottom.start.x > b.bottom.start.x
            ? gridSegment({ start: a.bottom.start, end: b.bottom.end })
            : gridSegment({ start: b.bottom.start, end: a.bottom.end })
      } else {
        return undefined
      }
    } else {
      bottom = a.bottom ?? b.bottom
    }

    if (a.left && b.left && a.left !== b.left) {
      if (
        computeProjectedLineIntersection(a.left, b.left, {
          parallelThreshold,
        }) === 'colinear'
      ) {
        left =
          a.left.start.y > b.left.start.y
            ? gridSegment({ start: a.left.start, end: b.left.end })
            : gridSegment({ start: b.left.start, end: a.left.end })
      } else {
        return undefined
      }
    } else {
      left = a.left ?? b.left
    }

    return { top, right, bottom, left }
  }

  /**
   * Builds boxes constructed by joining line segments together.
   */
  public build(): Set<Partial<GridBox>> {
    return new Set(this.segmentBoxMap.values())
  }
}

/**
 * Get all segments present in `box`.
 */
function getBoxSegments(box: Partial<GridBox>): GridSegment[]
function getBoxSegments(box: Partial<Box>): LineSegment[]
function getBoxSegments(
  box: Partial<Box> | Partial<GridBox>
): LineSegment[] | GridSegment[] {
  return [box.top, box.right, box.bottom, box.left].filter(
    (s): s is LineSegment => !!s
  )
}

export function isCompleteBox(partial: Partial<GridBox>): partial is GridBox {
  return getBoxSegments(partial).length === 4
}

export function mergeAdjacentLineSegments(
  segments: Iterable<GridSegment>,
  {
    parallelThreshold,
    maxConnectedSegmentGap,
  }: { parallelThreshold: number; maxConnectedSegmentGap: number }
): GridSegment[] {
  const result: GridSegment[] = [...segments]
  let merged: GridSegment | undefined

  do {
    merged = undefined

    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < result.length; j++) {
        if (i === j) {
          continue
        }

        const a = result[i]
        const b = result[j]
        const intersection = computeProjectedLineIntersection(a, b, {
          parallelThreshold,
        })

        if (
          isSameAngle(computeSegmentAngle(a), computeSegmentAngle(b)) &&
          intersection === 'colinear'
        ) {
          if (euclideanDistance(a.start, b.end) <= maxConnectedSegmentGap) {
            // `b` ends where `a` starts
            merged = gridSegment({ start: b.start, end: a.end })
          }
          if (euclideanDistance(b.start, a.end) <= maxConnectedSegmentGap) {
            // `a` ends where `b` starts
            merged = gridSegment({ start: a.start, end: b.end })
          }
        }

        if (merged) {
          result.splice(Math.max(i, j), 1)
          result.splice(Math.min(i, j), 1)
          result.push(merged)
          break
        }
      }

      if (merged) {
        break
      }
    }
  } while (merged)

  return result
}

export function inferBoxFromPartial(
  partial: Partial<GridBox>
): GridBox | undefined {
  const segments = getBoxSegments(partial)

  switch (segments.length) {
    case 4:
      return partial as GridBox

    case 3: {
      let { top, right, bottom, left } = partial
      if (top && right && bottom) {
        // infer left
        if (top.length > bottom.length) {
          bottom = adjustSegmentLength(bottom, top.length, 'forward')
        } else if (top.length < bottom.length) {
          top = adjustSegmentLength(top, bottom.length, 'backward')
        }

        return {
          top,
          right,
          bottom,
          left: gridSegment({ start: bottom.end, end: top.start }),
        }
      } else if (top && right && left) {
        // infer bottom
        if (left.length > right.length) {
          right = adjustSegmentLength(right, left.length, 'forward')
        } else if (left.length < right.length) {
          left = adjustSegmentLength(left, right.length, 'backward')
        }

        return {
          top,
          right,
          bottom: gridSegment({ start: right.end, end: left.start }),
          left,
        }
      } else if (top && bottom && left) {
        // infer right
        if (top.length > bottom.length) {
          bottom = adjustSegmentLength(bottom, top.length, 'backward')
        } else if (top.length < bottom.length) {
          top = adjustSegmentLength(top, bottom.length, 'forward')
        }

        return {
          top,
          right: gridSegment({ start: top.end, end: bottom.start }),
          bottom,
          left,
        }
      } else if (right && bottom && left) {
        // infer top
        if (left.length > right.length) {
          right = adjustSegmentLength(right, left.length, 'backward')
        } else if (left.length < right.length) {
          left = adjustSegmentLength(left, right.length, 'forward')
        }

        return {
          top: gridSegment({ start: left.end, end: right.start }),
          right,
          bottom,
          left,
        }
      } else {
        throw new Error(
          `constraint failed: 3 segments found but nothing to infer`
        )
      }
    }

    case 2: {
      const [a, b] = segments
      const aVertical = a.direction === 'up' || a.direction === 'down'
      const bVertical = b.direction === 'up' || b.direction === 'down'

      if (aVertical !== bVertical) {
        // a & b are perpendicular
        if (a === partial.top && b === partial.right) {
          const vTop = vectorSub(partial.top.end, partial.top.start)
          const vRight = vectorSub(partial.right.end, partial.right.start)
          return {
            top: partial.top,
            right: partial.right,
            bottom: gridSegment({
              start: partial.right.end,
              end: vectorSub(partial.right.end, vTop),
            }),
            left: gridSegment({
              start: vectorAdd(partial.top.start, vRight),
              end: partial.top.start,
            }),
          }
        } else if (a === partial.right && b === partial.bottom) {
          const vRight = vectorSub(partial.right.end, partial.right.start)
          const vBottom = vectorSub(partial.bottom.end, partial.bottom.start)
          return {
            top: gridSegment({
              start: vectorAdd(partial.right.start, vBottom),
              end: partial.right.start,
            }),
            right: partial.right,
            bottom: partial.bottom,
            left: gridSegment({
              start: partial.bottom.end,
              end: vectorSub(partial.bottom.end, vRight),
            }),
          }
        } else if (a === partial.bottom && b === partial.left) {
          const vBottom = vectorSub(partial.bottom.end, partial.bottom.start)
          const vLeft = vectorSub(partial.left.end, partial.left.start)
          return {
            top: gridSegment({
              start: partial.left.end,
              end: vectorSub(partial.left.end, vBottom),
            }),
            right: gridSegment({
              start: vectorAdd(partial.bottom.start, vLeft),
              end: partial.bottom.start,
            }),
            bottom: partial.bottom,
            left: partial.left,
          }
        } else if (a === partial.top && b === partial.left) {
          const vLeft = vectorSub(partial.left.end, partial.left.start)
          const vTop = vectorSub(partial.top.end, partial.top.start)
          return {
            top: partial.top,
            right: gridSegment({
              start: partial.top.end,
              end: vectorSub(partial.top.end, vLeft),
            }),
            bottom: gridSegment({
              start: vectorAdd(partial.left.start, vTop),
              end: partial.left.start,
            }),
            left: partial.left,
          }
        }
      }
      break
    }
  }

  return undefined
}

export function closeBoxSegmentGaps({
  top,
  right,
  bottom,
  left,
}: GridBox): GridBox {
  const topLeft = computeProjectedLineIntersection(left, top)

  if (typeof topLeft !== 'string') {
    left = gridSegment({ start: left.start, end: topLeft })
    top = gridSegment({ start: topLeft, end: top.end })
  }

  const topRight = computeProjectedLineIntersection(top, right)

  if (typeof topRight !== 'string') {
    top = gridSegment({ start: top.start, end: topRight })
    right = gridSegment({ start: topRight, end: right.end })
  }

  const bottomRight = computeProjectedLineIntersection(right, bottom)

  if (typeof bottomRight !== 'string') {
    right = gridSegment({ start: right.start, end: bottomRight })
    bottom = gridSegment({ start: bottomRight, end: bottom.end })
  }

  const bottomLeft = computeProjectedLineIntersection(bottom, left)

  if (typeof bottomLeft !== 'string') {
    bottom = gridSegment({ start: bottom.start, end: bottomLeft })
    left = gridSegment({ start: bottomLeft, end: left.end })
  }

  return { top, right, bottom, left }
}

/**
 * @see https://stackoverflow.com/a/565282/549363
 */
export function computeProjectedLineIntersection(
  segment1: GridSegment,
  segment2: GridSegment,
  { parallelThreshold = 0 } = {}
): Point | 'colinear' | 'parallel' {
  type Vector = Offset

  function cross(v: Vector, w: Vector): number {
    return v.x * w.y - v.y * w.x
  }

  function sub(v: Vector, w: Vector): Vector {
    return { x: v.x - w.x, y: v.y - w.y }
  }

  function add(v: Vector, w: Vector): Vector {
    return { x: v.x + w.x, y: v.y + w.y }
  }

  function mul(s: number, v: Vector): Vector {
    return { x: s * v.x, y: s * v.y }
  }

  const p: Vector = segment1.start
  const r: Vector = sub(segment1.end, segment1.start)
  const q: Vector = segment2.start
  const s: Vector = sub(segment2.end, segment2.start)
  const rxs = cross(r, s)
  const qsubp = sub(q, p)

  if (Math.abs(rxs) <= parallelThreshold) {
    if (Math.abs(cross(qsubp, r)) <= parallelThreshold) {
      // colinear (in the same line)
      return 'colinear'
    }

    return 'parallel'
  }

  const t = cross(qsubp, s) / rxs

  return add(p, mul(t, r))
}

function adjustSegmentLength(
  segment: GridSegment,
  length: number,
  direction: 'forward' | 'backward'
): GridSegment {
  const angle = computeSegmentAngle(segment)
  const dx = length * Math.cos(angle)
  const dy = length * Math.sin(angle)

  if (direction === 'forward') {
    return gridSegment({
      start: segment.start,
      end: vectorAdd(segment.start, { x: dx, y: dy }),
    })
  } else {
    return gridSegment({
      start: vectorSub(segment.end, { x: dx, y: dy }),
      end: segment.end,
    })
  }
}

export function drawBoxes(
  qc: QuickCanvas,
  boxes: Iterable<Partial<GridBox>>,
  { stroke, color: overrideColor }: { stroke?: number; color?: string } = {}
): QuickCanvas {
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
  for (const [i, box] of [...boxes].entries()) {
    const color = overrideColor ?? colors[i % colors.length]
    if (box.top) {
      qc.line(box.top.start, box.top.end, { color, stroke })
    }
    if (box.right) {
      qc.line(box.right.start, box.right.end, { color, stroke })
    }
    if (box.bottom) {
      qc.line(box.bottom.start, box.bottom.end, { color, stroke })
    }
    if (box.left) {
      qc.line(box.left.start, box.left.end, { color, stroke })
    }
  }

  return qc
}

export function filterContainedBoxes(boxes: Iterable<GridBox>): Set<GridBox> {
  return setFilter(
    boxes,
    (box, i, boxes) =>
      !boxes.some((container, j) => i !== j && boxContains(container, box))
  )
}

export function filterInBounds(
  boxes: Iterable<GridBox>,
  { bounds }: { bounds: Rect }
): Set<GridBox> {
  return setFilter(boxes, (box) =>
    getBoxSegments(box).every(
      ({ start, end }) =>
        rectContains(bounds, start) && rectContains(bounds, end)
    )
  )
}

export function area({ top, right, bottom, left }: GridBox): number {
  return (
    (((top.end.x - top.start.x + bottom.start.x - bottom.end.x) / 2) *
      (right.end.y - right.start.y + left.start.y - left.end.y)) /
    2
  )
}

export function boxContains(container: GridBox, contained: GridBox): boolean {
  const result =
    container.top.start.x <= contained.top.start.x &&
    container.top.start.y <= contained.top.start.y &&
    container.top.end.x >= contained.top.end.x &&
    container.top.end.y <= contained.top.end.y &&
    container.right.start.x >= contained.right.start.x &&
    container.right.start.y <= contained.right.start.y &&
    container.right.end.x >= contained.right.end.x &&
    container.right.end.y >= contained.right.end.y &&
    container.bottom.start.x >= contained.bottom.start.x &&
    container.bottom.start.y >= contained.bottom.start.y &&
    container.bottom.end.x <= contained.bottom.end.x &&
    container.bottom.end.y >= contained.bottom.end.y &&
    container.left.start.x <= contained.left.start.x &&
    container.left.start.y >= contained.left.start.y &&
    container.left.end.x <= contained.left.end.x &&
    container.left.end.y <= contained.left.end.y
  return result
}

export function splitIntoColumns(boxes: Iterable<GridBox>): LayoutColumn[] {
  const columns: GridBox[][] = []

  for (const box of boxes) {
    if (columns.length === 0) {
      columns.push([box])
    } else {
      for (let i = 0; i <= columns.length; i++) {
        if (i === columns.length) {
          columns.push([box])
          break
        }

        const column = columns[i]
        const columnMidX = (column[0].top.end.x + column[0].top.start.x) / 2

        if (box.top.start.x < columnMidX && box.top.end.x > columnMidX) {
          // in this column
          for (let j = 0; j <= column.length; j++) {
            if (j === column.length) {
              column.push(box)
              break
            }

            if (
              column[j].left.end.y + column[j].left.start.y >
              box.left.end.y + box.left.start.y
            ) {
              column.splice(j, 0, box)
              break
            }
          }

          break
        } else if (box.top.end.x < columnMidX) {
          // to the left of this column, insert new column
          columns.splice(i, 0, [box])
          break
        }
      }
    }
  }

  return columns
}

export function matchTemplateLayout(
  template: Layout,
  scan: Layout
): Layout | undefined {
  if (template.columns.length !== scan.columns.length) {
    return
  }

  const mergedColumns: LayoutColumn[] = []

  for (const [templateColumn, scanColumn] of zip(
    template.columns,
    scan.columns
  )) {
    console.log('attempting to merge column', mergedColumns.length)
    if (templateColumn.length > scanColumn.length) {
      return
    }

    const mergedColumn: GridBox[] = []

    for (
      let templateIndex = 0;
      templateIndex < templateColumn.length;
      templateIndex++
    ) {
      console.log('matching template contest', templateIndex)
      let scanIndex = 0

      while (scanIndex < scanColumn.length) {
        let mergedBox: GridBox | undefined
        let mergedScanEnd = scanIndex + 1

        for (; mergedScanEnd <= scanColumn.length; mergedScanEnd++) {
          console.log(
            'trying to match contests',
            scanIndex,
            'through',
            mergedScanEnd - 1
          )
          const merged = matchMerge(
            template,
            templateColumn[templateIndex],
            scan,
            scanColumn.slice(scanIndex, mergedScanEnd)
          )
          console.log('match?', !!merged)

          if (merged) {
            mergedBox = merged
          }
        }

        if (!mergedBox) {
          return
        }

        mergedColumn.push(mergedBox)
        scanIndex = mergedScanEnd - 1
      }
    }

    mergedColumns.push(mergedColumn)
  }

  return {
    width: scan.width,
    height: scan.height,
    columns: mergedColumns,
  }
}

export function boxCorners(box: GridBox): Corners {
  return [box.top.start, box.top.end, box.bottom.end, box.bottom.start]
}

export function matchMerge(
  template: Layout,
  templateBox: GridBox,
  scan: Layout,
  scanBoxes: readonly GridBox[],
  { allowedAreaRatioError = 0.02 } = {}
): GridBox | undefined {
  const templateArea = template.width * template.height
  const scanArea = scan.width * scan.height
  const templateCorners = boxCorners(templateBox)
  const templateBoxArea = poly4Area(templateCorners)
  const scanTop = scanBoxes[0]
  const scanBottom = scanBoxes[scanBoxes.length - 1]
  const [scanTopLeft, scanTopRight] = boxCorners(scanTop)
  const [, , scanBottomLeft, scanBottomRight] = boxCorners(scanBottom)
  const scanCorners: Corners = [
    scanTopLeft,
    scanTopRight,
    scanBottomLeft,
    scanBottomRight,
  ]

  const scanBoxesArea = poly4Area(scanCorners)
  const templateRatio = templateBoxArea / templateArea
  const scanRatio = scanBoxesArea / scanArea
  const areaRatioError = Math.abs(templateRatio - scanRatio)

  if (areaRatioError > allowedAreaRatioError) {
    return
  }

  return {
    top: scanTop.top,
    right: gridSegment({
      start: scanTop.right.start,
      end: scanBottom.right.end,
    }),
    bottom: scanBottom.bottom,
    left: gridSegment({
      start: scanBottom.left.start,
      end: scanTop.left.end,
    }),
  }
}
