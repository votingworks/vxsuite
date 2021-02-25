import { LineSegment } from '@votingworks/lsd'
import makeDebug from 'debug'
import { inspect } from 'util'
import { Corners, Offset, Point, Rect } from '../types'
import {
  euclideanDistance,
  poly4Area,
  rectContains,
  vectorAdd,
  vectorSub,
} from './geometry'
import { canvas, QuickCanvas } from './images'
import { integers, zip, zipMin } from './iterators'
import { setFilter, setFlatMap } from './set'

const debug = makeDebug('hmpb-interpreter:box')

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
  readonly original?: Set<GridSegment>
  readonly inferred?: boolean
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

export type Direction = 'right' | 'left' | 'up' | 'down'

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

export function deriveGridSegment(
  original: GridSegment,
  {
    start,
    end,
  }: {
    start?: Point
    end?: Point
  }
): GridSegment
export function deriveGridSegment(
  original: GridSegment[],
  {
    start,
    end,
  }: {
    start: Point
    end: Point
  }
): GridSegment
export function deriveGridSegment(
  original: GridSegment | GridSegment[],
  {
    start,
    end,
  }: {
    start?: Point
    end?: Point
  }
): GridSegment {
  if (!start || !end) {
    if (Array.isArray(original)) {
      throw new TypeError(
        'cannot infer start/end when given multiple original segments'
      )
    }
    start ??= original.start
    end ??= original.end
  }

  return gridSegment({
    start,
    end,
    original: new Set([
      ...(Array.isArray(original) ? original : new Set([original])),
    ]),
  })
}

export function gridSegment({
  start,
  end,
  original,
  inferred = original
    ? [...original].some(({ inferred }) => inferred)
    : undefined,
}: {
  start: Point
  end: Point
  original?: Set<GridSegment>
  inferred?: boolean
}): GridSegment {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return {
    start,
    end,
    original:
      original &&
      setFlatMap(original, (element) => element.original ?? new Set([element])),
    inferred,
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

export function segmentsEquivalent(a: GridSegment, b: GridSegment): boolean {
  return (
    a.start.x === b.start.x &&
    a.start.y === b.start.y &&
    a.end.x === b.end.x &&
    a.end.y === b.end.y &&
    a.direction === b.direction &&
    a.length === b.length
  )
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
  xScale: number,
  yScale: number,
  segment: GridSegment
): GridSegment {
  return deriveGridSegment(segment, {
    start: {
      x: xScale * segment.start.x,
      y: yScale * segment.start.y,
    },
    end: {
      x: xScale * segment.end.x,
      y: yScale * segment.end.y,
    },
  })
}

function computeSegmentAngle({ start, end }: GridSegment): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return Math.atan2(dy, dx)
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
  clockwise: Set<Partial<GridBox>>
  counterClockwise: Set<Partial<GridBox>>
  unusedSegments: Set<GridSegment>
} {
  const rotation = findRotation(segments)

  if (!rotation) {
    return {
      clockwise: new Set(),
      counterClockwise: new Set(),
      unusedSegments: new Set(segments),
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

  const ccwUnused = invertSegments([...counterClockwise.unusedSegments])
  return {
    clockwise: clockwise.boxes,
    counterClockwise: counterClockwise.boxes,
    unusedSegments: setFilter(clockwise.unusedSegments, (cw) =>
      ccwUnused.some((ccw) => segmentsEquivalent(cw, ccw))
    ),
  }
}

function invertSegment({
  start,
  end,
  direction,
  length,
}: GridSegment): GridSegment {
  return {
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
  }
}

function invertSegments(segments: readonly GridSegment[]): GridSegment[] {
  return segments.map(invertSegment)
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
}): { boxes: Set<Partial<GridBox>>; unusedSegments: Set<GridSegment> } {
  const unusedSegments = new Set([...up, ...down, ...left, ...right])
  const builder = new BoxesBuilder({ parallelThreshold })
  for (const r of right) {
    for (const u of up) {
      const dist = euclideanDistance(r.start, u.end)
      if (dist <= maxConnectedCornerDistance) {
        if (builder.addCorner({ left: u, top: r })) {
          unusedSegments.delete(u)
          unusedSegments.delete(r)
        }
      }
    }
  }

  for (const r of right) {
    for (const d of down) {
      const dist = euclideanDistance(r.end, d.start)
      if (dist <= maxConnectedCornerDistance) {
        if (builder.addCorner({ top: r, right: d })) {
          unusedSegments.delete(r)
          unusedSegments.delete(d)
        }
      }
    }
  }

  for (const l of left) {
    for (const d of down) {
      const dist = euclideanDistance(l.start, d.end)
      if (dist <= maxConnectedCornerDistance) {
        if (builder.addCorner({ right: d, bottom: l })) {
          unusedSegments.delete(d)
          unusedSegments.delete(l)
        }
      }
    }
  }

  const c = canvas()
  for (const l of left) {
    c.line(l.start, l.end, { color: 'red' })
    c.text(
      `${inspect({ start: Math.floor(l.start.x), end: Math.floor(l.end.x) })}`,
      l.end.x,
      l.end.y
    )
  }
  for (const u of up) {
    c.line(u.start, u.end, { color: 'green' })
    c.text(
      `${inspect({ start: Math.floor(u.start.y), end: Math.floor(u.end.y) })}`,
      u.start.x,
      u.start.y
    )
  }
  c.render(`debug-${Date.now()}.png`)

  for (const l of left) {
    for (const u of up) {
      const dist = euclideanDistance(l.end, u.start)
      if (dist <= maxConnectedCornerDistance) {
        if (builder.addCorner({ bottom: l, left: u })) {
          unusedSegments.delete(l)
          unusedSegments.delete(u)
        } else {
          console.log('failed to add bottom-left corner:', { l, u })
        }
      } else if (dist <= maxConnectedCornerDistance * 1.2) {
        console.log('bottom left corner was close but not quite:', {
          l,
          u,
          dist,
        })
      } else {
        // console.log('not close bottom left corner:', { l, u, dist })
      }
    }
  }

  return { boxes: builder.build(), unusedSegments }
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
  public addCorner(segments: { left: GridSegment; top: GridSegment }): boolean
  public addCorner(segments: { top: GridSegment; right: GridSegment }): boolean
  public addCorner(segments: {
    right: GridSegment
    bottom: GridSegment
  }): boolean
  public addCorner(segments: {
    bottom: GridSegment
    left: GridSegment
  }): boolean
  public addCorner(box: Partial<GridBox>): boolean {
    debug('addCorner: %s', Object.keys(box).sort().join('-'))
    const segments = getBoxSegments(box)
    const boxes = this.getBoxesForSegments(segments)
    const merged = [...boxes].reduce<Partial<GridBox> | undefined>(
      (previous, current) => previous && this.mergeBoxes(previous, current),
      box
    )

    if (merged) {
      debug(
        'addCorner: merge succeeded: %s',
        Object.keys(merged).sort().join('-')
      )
      for (const box of boxes) {
        for (const segment of getBoxSegments(box)) {
          this.segmentBoxMap.delete(segment)
        }
      }

      for (const segment of getBoxSegments(merged)) {
        this.segmentBoxMap.set(segment, merged)
      }

      return true
    } else {
      debug('addCorner: merge failed, removed segments: %O', segments)
      return false
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
      debug('attempting to merge top segments: %o <-> %o', a.top, b.top)
      const intersection = computeProjectedLineIntersection(a.top, b.top, {
        parallelThreshold,
      })
      if (intersection === 'colinear') {
        top =
          a.top.start.x < b.top.start.x
            ? deriveGridSegment([a.top, b.top], {
                start: a.top.start,
                end: b.top.end,
              })
            : deriveGridSegment([a.top, b.top], {
                start: b.top.start,
                end: a.top.end,
              })
      } else {
        debug(
          'failed because they were not colinear: intersection=%o',
          intersection
        )
        return undefined
      }
    } else {
      top = a.top ?? b.top
    }

    if (a.right && b.right && a.right !== b.right) {
      debug('attempting to merge right segments: %o <-> %o', a.right, b.right)
      const intersection = computeProjectedLineIntersection(a.right, b.right, {
        parallelThreshold,
      })
      if (intersection === 'colinear') {
        right =
          a.right.start.y < b.right.start.y
            ? deriveGridSegment([a.right, b.right], {
                start: a.right.start,
                end: b.right.end,
              })
            : deriveGridSegment([a.right, b.right], {
                start: b.right.start,
                end: a.right.end,
              })
      } else {
        debug(
          'failed because they were not colinear: intersection=%o',
          intersection
        )
        return undefined
      }
    } else {
      right = a.right ?? b.right
    }

    if (a.bottom && b.bottom && a.bottom !== b.bottom) {
      debug(
        'attempting to merge bottom segments: %o <-> %o',
        a.bottom,
        b.bottom
      )
      const intersection = computeProjectedLineIntersection(
        a.bottom,
        b.bottom,
        {
          parallelThreshold,
        }
      )
      if (intersection === 'colinear') {
        bottom =
          a.bottom.start.x > b.bottom.start.x
            ? deriveGridSegment([a.bottom, b.bottom], {
                start: a.bottom.start,
                end: b.bottom.end,
              })
            : deriveGridSegment([a.bottom, b.bottom], {
                start: b.bottom.start,
                end: a.bottom.end,
              })
      } else {
        debug(
          'failed because they were not colinear: intersection=%o',
          intersection
        )
        return undefined
      }
    } else {
      bottom = a.bottom ?? b.bottom
    }

    if (a.left && b.left && a.left !== b.left) {
      debug('attempting to merge left segments: %o <-> %o', a.left, b.left)
      const intersection = computeProjectedLineIntersection(a.left, b.left, {
        parallelThreshold,
      })
      if (intersection === 'colinear') {
        left =
          a.left.start.y > b.left.start.y
            ? deriveGridSegment([a.left, b.left], {
                start: a.left.start,
                end: b.left.end,
              })
            : deriveGridSegment([a.left, b.left], {
                start: b.left.start,
                end: a.left.end,
              })
      } else {
        debug(
          'failed because they were not colinear: intersection=%o',
          intersection
        )
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
            merged = deriveGridSegment([a, b], { start: b.start, end: a.end })
          }
          if (euclideanDistance(b.start, a.end) <= maxConnectedSegmentGap) {
            // `a` ends where `b` starts
            merged = deriveGridSegment([a, b], { start: a.start, end: b.end })
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
  partial: Partial<GridBox>,
  unusedSegments: ReadonlySet<GridSegment> = new Set<GridSegment>()
): { box: GridBox; unusedSegments: ReadonlySet<GridSegment> } | undefined {
  const segments = getBoxSegments(partial)

  switch (segments.length) {
    case 4:
      return { box: partial as GridBox, unusedSegments }

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
          box: {
            top,
            right,
            bottom,
            left: gridSegment({
              start: bottom.end,
              end: top.start,
              inferred: true,
            }),
          },
          unusedSegments,
        }
      } else if (top && right && left) {
        // infer bottom
        if (left.length > right.length) {
          right = adjustSegmentLength(right, left.length, 'forward')
        } else if (left.length < right.length) {
          left = adjustSegmentLength(left, right.length, 'backward')
        }

        return {
          box: {
            top,
            right,
            bottom: gridSegment({
              start: right.end,
              end: left.start,
              inferred: true,
            }),
            left,
          },
          unusedSegments,
        }
      } else if (top && bottom && left) {
        // infer right
        if (top.length > bottom.length) {
          bottom = adjustSegmentLength(bottom, top.length, 'backward')
        } else if (top.length < bottom.length) {
          top = adjustSegmentLength(top, bottom.length, 'forward')
        }

        return {
          box: {
            top,
            right: gridSegment({
              start: top.end,
              end: bottom.start,
              inferred: true,
            }),
            bottom,
            left,
          },
          unusedSegments,
        }
      } else if (right && bottom && left) {
        // infer top
        if (left.length > right.length) {
          right = adjustSegmentLength(right, left.length, 'backward')
        } else if (left.length < right.length) {
          left = adjustSegmentLength(left, right.length, 'forward')
        }

        return {
          box: {
            top: gridSegment({
              start: left.end,
              end: right.start,
              inferred: true,
            }),
            right,
            bottom,
            left,
          },
          unusedSegments,
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
            box: {
              top: partial.top,
              right: partial.right,
              bottom: gridSegment({
                start: partial.right.end,
                end: vectorSub(partial.right.end, vTop),
                inferred: true,
              }),
              left: gridSegment({
                start: vectorAdd(partial.top.start, vRight),
                end: partial.top.start,
                inferred: true,
              }),
            },
            unusedSegments,
          }
        } else if (a === partial.right && b === partial.bottom) {
          const vRight = vectorSub(partial.right.end, partial.right.start)
          const vBottom = vectorSub(partial.bottom.end, partial.bottom.start)
          return {
            box: {
              top: gridSegment({
                start: vectorAdd(partial.right.start, vBottom),
                end: partial.right.start,
                inferred: true,
              }),
              right: partial.right,
              bottom: partial.bottom,
              left: gridSegment({
                start: partial.bottom.end,
                end: vectorSub(partial.bottom.end, vRight),
                inferred: true,
              }),
            },
            unusedSegments,
          }
        } else if (a === partial.bottom && b === partial.left) {
          const vBottom = vectorSub(partial.bottom.end, partial.bottom.start)
          const vLeft = vectorSub(partial.left.end, partial.left.start)
          return {
            box: {
              top: gridSegment({
                start: partial.left.end,
                end: vectorSub(partial.left.end, vBottom),
                inferred: true,
              }),
              right: gridSegment({
                start: vectorAdd(partial.bottom.start, vLeft),
                end: partial.bottom.start,
                inferred: true,
              }),
              bottom: partial.bottom,
              left: partial.left,
            },
            unusedSegments,
          }
        } else if (a === partial.top && b === partial.left) {
          const vLeft = vectorSub(partial.left.end, partial.left.start)
          const vTop = vectorSub(partial.top.end, partial.top.start)
          return {
            box: {
              top: partial.top,
              right: gridSegment({
                start: partial.top.end,
                end: vectorSub(partial.top.end, vLeft),
                inferred: true,
              }),
              bottom: gridSegment({
                start: vectorAdd(partial.left.start, vTop),
                end: partial.left.start,
                inferred: true,
              }),
              left: partial.left,
            },
            unusedSegments,
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
    left = deriveGridSegment([left], {
      start: left.start,
      end: topLeft,
    })
    top = deriveGridSegment([top], {
      start: topLeft,
      end: top.end,
    })
  }

  const topRight = computeProjectedLineIntersection(top, right)

  if (typeof topRight !== 'string') {
    top = deriveGridSegment([top], {
      start: top.start,
      end: topRight,
    })
    right = deriveGridSegment([right], {
      start: topRight,
      end: right.end,
    })
  }

  const bottomRight = computeProjectedLineIntersection(right, bottom)

  if (typeof bottomRight !== 'string') {
    right = deriveGridSegment([right], {
      start: right.start,
      end: bottomRight,
    })
    bottom = deriveGridSegment([bottom], {
      start: bottomRight,
      end: bottom.end,
    })
  }

  const bottomLeft = computeProjectedLineIntersection(bottom, left)

  if (typeof bottomLeft !== 'string') {
    bottom = deriveGridSegment([bottom], {
      start: bottom.start,
      end: bottomLeft,
    })
    left = deriveGridSegment([left], {
      start: bottomLeft,
      end: left.end,
    })
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
    return deriveGridSegment(segment, {
      end: vectorAdd(segment.start, { x: dx, y: dy }),
    })
  } else {
    return deriveGridSegment(segment, {
      start: vectorSub(segment.end, { x: dx, y: dy }),
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
  const inferredDash = [10, 10]
  for (const [i, box] of [...boxes].entries()) {
    const color = overrideColor ?? colors[i % colors.length]
    if (box.top) {
      qc.line(box.top.start, box.top.end, {
        color,
        stroke,
        dash: box.top.inferred ? inferredDash : undefined,
      })
    }
    if (box.right) {
      qc.line(box.right.start, box.right.end, {
        color,
        stroke,
        dash: box.right.inferred ? inferredDash : undefined,
      })
    }
    if (box.bottom) {
      qc.line(box.bottom.start, box.bottom.end, {
        color,
        stroke,
        dash: box.bottom.inferred ? inferredDash : undefined,
      })
    }
    if (box.left) {
      qc.line(box.left.start, box.left.end, {
        color,
        stroke,
        dash: box.left.inferred ? inferredDash : undefined,
      })
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
        rectContains(bounds, start) || rectContains(bounds, end)
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
  debug('splitIntoColumns BEGIN')
  const columns: GridBox[][] = []

  for (const [box, b] of zipMin(boxes, integers())) {
    debug('placing box %d; there are %d column(s)', b, columns.length)
    if (columns.length === 0) {
      debug('no existing columns, adding box to new first column')
      columns.push([box])
    } else {
      for (let c = 0; c <= columns.length; c++) {
        if (c === columns.length) {
          debug('no existing columns fit box, adding to new last column')
          columns.push([box])
          break
        }
        debug('checking whether box %i fits in column %d', b, c)

        const column = columns[c]
        const columnMidX = (column[0].top.end.x + column[0].top.start.x) / 2
        const boxMidX = (box.top.end.x + box.top.start.x) / 2

        if (
          (box.top.start.x < columnMidX && box.top.end.x > columnMidX) ||
          (column[0].top.start.x < boxMidX && column[0].top.end.x > boxMidX)
        ) {
          debug('box %d fits inside column %d, adding to column', b, c)
          for (let i = 0; i <= column.length; i++) {
            if (i === column.length) {
              debug(
                'box does not go before any of the existing boxes, adding to the end'
              )
              column.push(box)
              break
            }
            debug(
              'checking whether box %d fits before the existing box at %d,%d',
              b,
              c,
              i
            )

            if (
              column[i].left.end.y + column[i].left.start.y >
              box.left.end.y + box.left.start.y
            ) {
              debug(
                'inserting box %d fits before the existing box at %d,%d',
                b,
                c,
                i
              )
              column.splice(i, 0, box)
              break
            }
          }

          break
        } else if (box.top.end.x < columnMidX) {
          debug('box %d fits before column %d, adding a new column', b, c)
          columns.splice(c, 0, [box])
          break
        }
      }
    }
  }

  debug(
    'splitIntoColumns END %s',
    columns.map(({ length }) => length).join(',')
  )
  return columns
}

export function matchTemplateLayout(
  template: Layout,
  scan: Layout,
  unusedSegments: Iterable<GridSegment>
): Layout | undefined {
  debug(
    'matchTemplateLayout merging: template=%s scan=%s',
    template.columns.map(({ length }) => length).join(','),
    scan.columns.map(({ length }) => length).join(',')
  )

  if (template.columns.length !== scan.columns.length) {
    debug('column count differs, cannot merge')
    return
  }

  const mergedColumns: LayoutColumn[] = []

  for (const [templateColumn, scanColumn] of zip(
    template.columns,
    scan.columns
  )) {
    debug(
      'attempting to merge column %d; template=%d scan=%d',
      mergedColumns.length,
      templateColumn.length,
      scanColumn.length
    )
    if (scanColumn.length < templateColumn.length) {
      debug(
        'not enough scan boxes (%d < %d), bailing',
        scanColumn.length,
        templateColumn.length
      )
      return
    }

    const mergedColumn: GridBox[] = []
    let scanIndex = 0

    for (
      let templateIndex = 0;
      templateIndex < templateColumn.length;
      templateIndex++
    ) {
      debug(
        'matching scan boxes for template box %d starting at scan box %d',
        templateIndex,
        scanIndex
      )
      let underfilledBox: GridBox | undefined
      let underfilledScanEnd = -1
      let mergedBox: GridBox | undefined
      let mergedScanEnd = -1

      for (
        let scanEnd = scanIndex + 1;
        scanEnd <= scanColumn.length;
        scanEnd++
      ) {
        debug(
          'matching scan boxes %d..<%d with template box %d',
          scanIndex,
          scanEnd,
          templateIndex
        )
        const matchMergeResult = matchMerge(
          template,
          templateColumn[templateIndex],
          scan,
          scanColumn.slice(scanIndex, scanEnd)
        )

        if (matchMergeResult.type === 'merged') {
          debug(
            'match succeeded, continuing in case a duplicate box should be included'
          )
          mergedBox = matchMergeResult.merged
          mergedScanEnd = scanEnd
        } else if (matchMergeResult.type === 'underfilled') {
          underfilledBox = matchMergeResult.underfilled
          underfilledScanEnd = scanEnd
        } else {
          if (mergedBox) {
            debug(
              'match failed after a match succeeded, reverting to last success matching scan boxes %d..<%d with template %d',
              scanIndex,
              mergedScanEnd,
              templateIndex
            )
            break
          }
        }
      }

      if (
        !mergedBox &&
        underfilledBox &&
        !underfilledBox.top.inferred &&
        underfilledBox.bottom.inferred
      ) {
        debug(
          'attempting to replace incorrectly-inferred bottom edge with a matching unused edge with an unused segment matching length≈%d',
          underfilledBox.top.length
        )
        for (const segment of unusedSegments) {
          debug(
            'checking candidate bottom segment: direction=%s length=%d',
            segment.direction,
            segment.length
          )
          if (
            (segment.direction === 'left' || segment.direction === 'right') &&
            segment.length > 0.5 * underfilledBox.top.length
          ) {
            const matchMergeResult = matchMerge(
              template,
              templateColumn[templateIndex],
              scan,
              [
                closeBoxSegmentGaps({
                  ...underfilledBox,
                  bottom:
                    segment.direction === 'left'
                      ? segment
                      : invertSegment(segment),
                }),
              ]
            )

            if (matchMergeResult.type === 'merged') {
              debug(
                'found a suitable segment for the previously incorrectly-inferred bottom edge: %o',
                segment
              )
              mergedBox = matchMergeResult.merged
              mergedScanEnd = underfilledScanEnd
              break
            }
          }
        }
      }

      if (!mergedBox) {
        debug(
          'no match was found for template column %d box %d, bailing',
          mergedColumns.length,
          templateIndex
        )
        return
      }

      debug(
        'template column %d box %d matched scan boxes %d..<%d',
        mergedColumns.length,
        templateIndex,
        scanIndex,
        mergedScanEnd
      )
      mergedColumn.push(mergedBox)
      scanIndex = mergedScanEnd
    }

    debug(
      'match succeeded for column %d, merged %d scan box(es) into %d template box(es)',
      mergedColumns.length,
      scanColumn.length,
      templateColumn.length
    )
    mergedColumns.push(mergedColumn)
  }

  debug(
    'matchTemplateLayout completed successfully: merged=%s',
    template.columns.map(({ length }) => length).join(',')
  )
  return {
    width: scan.width,
    height: scan.height,
    columns: mergedColumns,
  }
}

export function boxCorners(box: GridBox): Corners {
  return [box.top.start, box.top.end, box.bottom.end, box.bottom.start]
}

export type MatchMergeResult =
  | { type: 'merged'; merged: GridBox }
  | { type: 'underfilled'; underfilled: GridBox }
  | { type: 'overfilled'; overfilled: GridBox }

export function matchMerge(
  template: Layout,
  templateBox: GridBox,
  scan: Layout,
  scanBoxes: readonly GridBox[],
  { allowedAreaRatioError = 0.1 } = {}
): MatchMergeResult {
  const templateArea = template.width * template.height
  const scanArea = scan.width * scan.height
  const expectedRatio = scanArea / templateArea
  const minRatio = expectedRatio * (1 - allowedAreaRatioError)
  const maxRatio = expectedRatio * (1 + allowedAreaRatioError)
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
  const candidate = {
    top: scanTop.top,
    right: deriveGridSegment([scanTop.right, scanBottom.right], {
      start: scanTop.right.start,
      end: scanBottom.right.end,
    }),
    bottom: scanBottom.bottom,
    left: deriveGridSegment([scanTop.left, scanBottom.left], {
      start: scanBottom.left.start,
      end: scanTop.left.end,
    }),
  }
  const ratio = scanBoxesArea / templateBoxArea

  if (ratio < minRatio) {
    debug(
      'scan area too small compared to scaled template area: %d < %d',
      ratio,
      minRatio
    )
    return { type: 'underfilled', underfilled: candidate }
  } else if (ratio > maxRatio) {
    debug(
      'scan area too large compared to scaled template area: %d > %d',
      ratio,
      maxRatio
    )
    return { type: 'overfilled', overfilled: candidate }
  } else {
    return { type: 'merged', merged: candidate }
  }
}
