import { LineSegment } from '@votingworks/lsd'
import { euclideanDistance, poly4Area } from './geometry'
import { canvas, QuickCanvas } from './images'
import { Corners, Offset, Point } from '../types'
import { setFilter } from './set'
import { zip } from './iterators'

interface BoxOf<Type> {
  top: Type
  right: Type
  bottom: Type
  left: Type
}

export type Box = BoxOf<LineSegment>

export type LayoutColumn = readonly Box[]

export interface Layout {
  readonly width: number
  readonly height: number
  readonly columns: readonly LayoutColumn[]
}

type Direction = 'right' | 'left' | 'up' | 'down'

interface AnnotatedSegment {
  readonly segment: LineSegment
  readonly angle: number
  readonly diff: number
  readonly direction: Direction
  readonly min: Point
  readonly max: Point
}

export interface Rotation {
  readonly angle: number
  readonly matchedSegments: readonly AnnotatedSegment[]
}

const TWO_PI = 2 * Math.PI

/**
 * Turns right if `a` + 90° ≈ `b`.
 */
function isRightTurn(
  a: number,
  b: number,
  { allowedDelta = (2 / 180) * Math.PI } = {}
): boolean {
  const ap = (a + TWO_PI) % TWO_PI
  const bp = (b + TWO_PI) % TWO_PI
  const diff = (bp - ap + TWO_PI) % TWO_PI
  return (
    Math.PI / 2 - allowedDelta <= diff && diff <= Math.PI / 2 + allowedDelta
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
  scale: number,
  segment: LineSegment
): LineSegment {
  return {
    x1: segment.x1 * scale,
    y1: segment.y1 * scale,
    x2: segment.x2 * scale,
    y2: segment.y2 * scale,
    width: segment.width * scale,
  }
}

function computeSegmentAngle(segment: LineSegment): number {
  const { x1, y1, x2, y2 } = segment
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.atan2(dy, dx)
}

function computeSegmentLength(segment: LineSegment): number {
  return euclideanDistance(
    { x: segment.x1, y: segment.y1 },
    { x: segment.x2, y: segment.y2 }
  )
}

export function scaleBox(scale: number, box: Partial<Box>): Partial<Box> {
  return {
    top: box.top && scaleLineSegment(scale, box.top),
    right: box.right && scaleLineSegment(scale, box.right),
    bottom: box.bottom && scaleLineSegment(scale, box.bottom),
    left: box.left && scaleLineSegment(scale, box.left),
  }
}

export function findRotation(
  segments: readonly LineSegment[],
  { sameDiffThreshold = (1 / 180) * Math.PI } = {}
): Rotation | undefined {
  const rightward = Math.atan2(0, 1)
  const leftward = Math.atan2(0, -1)
  const downward = Math.atan2(1, 0)
  const upward = Math.atan2(-1, 0)
  const annotated: AnnotatedSegment[] = []

  for (const segment of segments) {
    const { x1, y1, x2, y2 } = segment
    const angle = computeSegmentAngle(segment)
    let diff: number
    let direction: Direction
    let min: Point
    let max: Point

    const rdiff = Math.abs(rightward - angle)
    const udiff = Math.abs(upward - angle)
    const ldiff = Math.abs(leftward - angle)
    const ddiff = Math.abs(downward - angle)

    if (rdiff < udiff && rdiff < ldiff && rdiff < ddiff) {
      direction = 'right'
      diff = angle - rightward
      min = { x: x1, y: y1 }
      max = { x: x2, y: y2 }
    } else if (ldiff < udiff && ldiff < rdiff && ldiff < ddiff) {
      direction = 'left'
      diff = angle - leftward
      min = { x: x2, y: y2 }
      max = { x: x1, y: y1 }
    } else if (udiff < ldiff && udiff < rdiff && udiff < ddiff) {
      direction = 'up'
      diff = angle - upward
      min = { x: x2, y: y2 }
      max = { x: x1, y: y1 }
    } else {
      direction = 'down'
      diff = angle - downward
      min = { x: x1, y: y1 }
      max = { x: x2, y: y2 }
    }

    annotated.push({
      segment,
      angle,
      diff,
      direction,
      min,
      max,
    })
  }

  const grouped = [...annotated]
    .sort((a, b) => a.diff - b.diff)
    .reduce<AnnotatedSegment[][]>(
      (out, annotatedSegment, i, sorted) => {
        out[out.length - 1].push(annotatedSegment)
        if (
          sorted[i + 1] &&
          Math.abs(sorted[i + 1].diff - annotatedSegment.diff) >
            sameDiffThreshold
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
  return { angle, matchedSegments: largestGroup }
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
  segments: readonly LineSegment[],
  {
    maxConnectedCornerDistance,
    parallelThreshold,
  }: { maxConnectedCornerDistance: number; parallelThreshold: number }
): { clockwise: Set<Partial<Box>>; counterClockwise: Set<Partial<Box>> } {
  const rotation = findRotation(segments)

  if (!rotation) {
    return { clockwise: new Set(), counterClockwise: new Set() }
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
    up: invertSegments(up),
    down: invertSegments(down),
    left: invertSegments(left),
    right: invertSegments(right),
    parallelThreshold,
    maxConnectedCornerDistance,
  })

  return { clockwise, counterClockwise }
}

function invertSegments(
  segments: readonly AnnotatedSegment[]
): AnnotatedSegment[] {
  return segments.map(
    ({
      angle,
      diff,
      direction,
      segment: { x1, x2, y1, y2, width },
      min,
      max,
    }) => ({
      angle: (angle + Math.PI) % (2 * Math.PI),
      diff,
      direction:
        direction === 'up'
          ? 'down'
          : direction === 'down'
          ? 'up'
          : direction === 'left'
          ? 'right'
          : 'left',
      segment: { x1: x2, y1: y2, x2: x1, y2: y1, width },
      min: max,
      max: min,
    })
  )
}

function findBoxesFromSegments({
  up,
  down,
  left,
  right,
  parallelThreshold,
  maxConnectedCornerDistance,
}: {
  up: AnnotatedSegment[]
  down: AnnotatedSegment[]
  left: AnnotatedSegment[]
  right: AnnotatedSegment[]
  parallelThreshold: number
  maxConnectedCornerDistance: number
}): Set<Partial<Box>> {
  const builder = new BoxesBuilder({ parallelThreshold })
  const tlqc = canvas().size(1060, 1750)
  for (const r of right) {
    for (const u of up) {
      const dist = euclideanDistance(r.min, u.min)

      if (dist <= maxConnectedCornerDistance && isRightTurn(u.angle, r.angle)) {
        tlqc.line(u.min, u.max).line(r.min, r.max)
        builder.addCorner({ left: u, top: r })
      } else if (dist <= maxConnectedCornerDistance) {
        tlqc
          .line(u.min, u.max, { color: 'red' })
          .line(r.min, r.max, { color: 'red' })
      }
    }
  }
  // tlqc.render('debug-tlqc.png')

  const trqc = canvas().size(1060, 1750)
  for (const r of right) {
    for (const d of down) {
      const dist = euclideanDistance(r.max, d.min)
      if (dist <= maxConnectedCornerDistance && isRightTurn(r.angle, d.angle)) {
        trqc.line(d.min, d.max).line(r.min, r.max)
        builder.addCorner({ top: r, right: d })
      } else if (dist <= maxConnectedCornerDistance) {
        trqc
          .line(d.min, d.max, { color: 'red' })
          .line(r.min, r.max, { color: 'red' })
      }
    }
  }
  // trqc.render('debug-trqc.png')

  const brqc = canvas().size(1060, 1750)
  for (const l of left) {
    for (const d of down) {
      const dist = euclideanDistance(l.max, d.max)
      if (dist <= maxConnectedCornerDistance && isRightTurn(d.angle, l.angle)) {
        brqc.line(d.min, d.max).line(l.min, l.max)
        builder.addCorner({ right: d, bottom: l })
      } else if (dist <= maxConnectedCornerDistance) {
        brqc
          .line(d.min, d.max, { color: 'red' })
          .line(l.min, l.max, { color: 'red' })
      }
    }
  }
  // brqc.render('debug-brqc.png')

  const blqc = canvas().size(1060, 1750)
  for (const l of left) {
    for (const u of up) {
      const dist = euclideanDistance(l.min, u.max)
      if (dist <= maxConnectedCornerDistance && isRightTurn(l.angle, u.angle)) {
        blqc.line(u.min, u.max).line(l.min, l.max)
        builder.addCorner({ bottom: l, left: u })
      } else if (dist <= maxConnectedCornerDistance) {
        blqc
          .line(u.min, u.max, { color: 'red' })
          .line(l.min, l.max, { color: 'red' })
      }
    }
  }
  // blqc.render('debug-blqc.png')

  return builder.build()
}

function toLineSegment(segment: LineSegment | AnnotatedSegment): LineSegment {
  return 'segment' in segment ? segment.segment : segment
}

function toLineSegmentBox(
  box: Partial<Box> | Partial<BoxOf<AnnotatedSegment>>
): Partial<Box> {
  return {
    top: box.top && toLineSegment(box.top),
    right: box.right && toLineSegment(box.right),
    bottom: box.bottom && toLineSegment(box.bottom),
    left: box.left && toLineSegment(box.left),
  }
}

/**
 * Builds `Box` instances by joining line segments at corners.
 */
class BoxesBuilder {
  private readonly segmentBoxMap = new Map<LineSegment, Partial<Box>>()
  private readonly parallelThreshold: number

  public constructor({ parallelThreshold }: { parallelThreshold: number }) {
    this.parallelThreshold = parallelThreshold
  }

  /**
   * Get the boxes which are associated with the given `segments`.
   */
  private getBoxesForSegments(
    segments: readonly LineSegment[]
  ): Set<Partial<Box>> {
    return new Set(
      segments
        .map((s) => this.segmentBoxMap.get(s))
        .filter((b): b is Partial<Box> => !!b)
    )
  }

  /**
   * Add a corner to join two segments together. If these segments are
   * previously unknown, a new `Box` will be created for them. If one or both
   * of them are previously known, the associated box(es) will be merged. If
   * the boxes cannot be merged they will be ignored.
   */
  public addCorner(segments: {
    left: AnnotatedSegment
    top: AnnotatedSegment
  }): void
  public addCorner(segments: {
    top: AnnotatedSegment
    right: AnnotatedSegment
  }): void
  public addCorner(segments: {
    right: AnnotatedSegment
    bottom: AnnotatedSegment
  }): void
  public addCorner(segments: {
    bottom: AnnotatedSegment
    left: AnnotatedSegment
  }): void
  public addCorner(box: Partial<BoxOf<AnnotatedSegment>>): void {
    const segments = getBoxSegments(box)
    const boxes = this.getBoxesForSegments(segments)
    const merged = [...boxes].reduce<Partial<Box> | undefined>(
      (previous, current) => previous && this.mergeBoxes(previous, current),
      toLineSegmentBox(box)
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
    a: Partial<Box>,
    b: Partial<Box>
  ): Partial<Box> | undefined {
    const { parallelThreshold } = this
    let top: LineSegment | undefined
    let right: LineSegment | undefined
    let bottom: LineSegment | undefined
    let left: LineSegment | undefined

    if (a.top && b.top && a.top !== b.top) {
      if (
        computeProjectedLineIntersection(a.top, b.top, {
          parallelThreshold,
        }) === 'colinear'
      ) {
        top =
          a.top.x1 < b.top.x1
            ? {
                x1: a.top.x1,
                y1: a.top.y1,
                x2: b.top.x2,
                y2: b.top.y2,
                width: a.top.width,
              }
            : {
                x1: b.top.x1,
                y1: b.top.y1,
                x2: a.top.x2,
                y2: a.top.y2,
                width: b.top.width,
              }
      } else {
        // console.log('determined top segments not colinear', a.top, b.top)
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
          a.right.y1 < b.right.y1
            ? {
                x1: a.right.x1,
                y1: a.right.y1,
                x2: b.right.x2,
                y2: b.right.y2,
                width: a.right.width,
              }
            : {
                x1: b.right.x1,
                y1: b.right.y1,
                x2: a.right.x2,
                y2: a.right.y2,
                width: b.right.width,
              }
      } else {
        // console.log('determined right segments not colinear', a.right, b.right)
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
          a.bottom.x1 > b.bottom.x1
            ? {
                x1: a.bottom.x1,
                y1: a.bottom.y1,
                x2: b.bottom.x2,
                y2: b.bottom.y2,
                width: a.bottom.width,
              }
            : {
                x1: b.bottom.x1,
                y1: b.bottom.y1,
                x2: a.bottom.x2,
                y2: a.bottom.y2,
                width: b.bottom.width,
              }
      } else {
        // console.log(
        //   'determined bottom segments not colinear',
        //   a.bottom,
        //   b.bottom
        // )
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
          a.left.y1 > b.left.y1
            ? {
                x1: a.left.x1,
                y1: a.left.y1,
                x2: b.left.x2,
                y2: b.left.y2,
                width: a.left.width,
              }
            : {
                x1: b.left.x1,
                y1: b.left.y1,
                x2: a.left.x2,
                y2: a.left.y2,
                width: b.left.width,
              }
      } else {
        // console.log('determined left segments not colinear', a.left, b.left)
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
  public build(): Set<Partial<Box>> {
    return new Set(this.segmentBoxMap.values())
  }
}

/**
 * Get all segments present in `box`.
 */
function getBoxSegments(
  box: Partial<Box> | Partial<BoxOf<AnnotatedSegment>>
): LineSegment[] {
  return [box.top, box.right, box.bottom, box.left]
    .map((s) => s && toLineSegment(s))
    .filter((s): s is LineSegment => !!s)
}

export function isCompleteBox(partial: Partial<Box>): partial is Box {
  return getBoxSegments(partial).length === 4
}

export function isCompleteAnnotatedBox(
  partial: Partial<BoxOf<AnnotatedSegment>>
): partial is BoxOf<AnnotatedSegment> {
  return getBoxSegments(partial).length === 4
}

export function mergeAdjacentLineSegments(
  segments: Iterable<LineSegment>,
  {
    parallelThreshold,
    maxConnectedSegmentGap,
  }: { parallelThreshold: number; maxConnectedSegmentGap: number }
): LineSegment[] {
  const result: LineSegment[] = [...segments]
  let merged: LineSegment | undefined

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
          if (
            euclideanDistance({ x: a.x1, y: a.y1 }, { x: b.x2, y: b.y2 }) <=
            maxConnectedSegmentGap
          ) {
            // `b` ends where `a` starts
            merged = {
              x1: b.x1,
              y1: b.y1,
              x2: a.x2,
              y2: a.y2,
              width: (a.width + b.width) / 2,
            }
          }
          if (
            euclideanDistance({ x: b.x1, y: b.y1 }, { x: a.x2, y: a.y2 }) <=
            maxConnectedSegmentGap
          ) {
            // `a` ends where `b` starts
            merged = {
              x1: a.x1,
              y1: a.y1,
              x2: b.x2,
              y2: b.y2,
              width: (a.width + b.width) / 2,
            }
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

export function inferBoxFromPartial(partial: Partial<Box>): Box | undefined {
  const segments = getBoxSegments(partial)

  switch (segments.length) {
    case 4:
      return partial as Box

    case 3: {
      let { top, right, bottom, left } = partial
      if (top && right && bottom) {
        // infer left
        const topLength = computeSegmentLength(top)
        const bottomLength = computeSegmentLength(bottom)

        if (topLength > bottomLength) {
          bottom = adjustSegmentLength(bottom, topLength, 'forward')
        } else if (topLength < bottomLength) {
          top = adjustSegmentLength(top, bottomLength, 'backward')
        }

        return {
          top,
          right,
          bottom,
          left: {
            x1: bottom.x2,
            y1: bottom.y2,
            x2: top.x1,
            y2: top.y1,
            width: right.width,
          },
        }
      } else if (top && right && left) {
        // infer bottom
        const leftLength = computeSegmentLength(left)
        const rightLength = computeSegmentLength(right)

        if (leftLength > rightLength) {
          right = adjustSegmentLength(right, leftLength, 'forward')
        } else if (leftLength < rightLength) {
          left = adjustSegmentLength(left, rightLength, 'backward')
        }

        return {
          top,
          right,
          bottom: {
            x1: right.x2,
            y1: right.y2,
            x2: left.x1,
            y2: left.y1,
            width: top.width,
          },
          left,
        }
      } else if (top && bottom && left) {
        // infer right
        const topLength = computeSegmentLength(top)
        const bottomLength = computeSegmentLength(bottom)

        if (topLength > bottomLength) {
          bottom = adjustSegmentLength(bottom, topLength, 'backward')
        } else if (topLength < bottomLength) {
          top = adjustSegmentLength(top, bottomLength, 'forward')
        }

        return {
          top,
          right: {
            x1: top.x2,
            y1: top.y2,
            x2: bottom.x1,
            y2: bottom.y1,
            width: top.width,
          },
          bottom,
          left,
        }
      } else if (right && bottom && left) {
        // infer top
        const leftLength = computeSegmentLength(left)
        const rightLength = computeSegmentLength(right)

        if (leftLength > rightLength) {
          right = adjustSegmentLength(right, leftLength, 'backward')
        } else if (leftLength < rightLength) {
          left = adjustSegmentLength(left, rightLength, 'forward')
        }

        return {
          top: {
            x1: left.x2,
            y1: left.y2,
            x2: right.x1,
            y2: right.y1,
            width: bottom.width,
          },
          right,
          bottom,
          left,
        }
      } else {
        throw new Error(
          `constraint failed: 3 segments found but nothing to infer`
        )
      }

      // const [a,b,c] = segments

      // if (a === partial.top) {
      //   if (b === partial.right) {
      //     if (c === partial.bottom) {
      //       // infer left
      //     } else if (c === partial.left) {
      //       // infer bottom
      //     }
      //   }
      // }
      // const segmentsAndAngles = segments.map((segment) => ({
      //   segment,
      //   angle: computeSegmentAngle(segment),
      // }))

      // while (
      //   Math.abs(segmentsAndAngles[0].angle - segmentsAndAngles[1].angle) <
      //   Math.abs(segmentsAndAngles[1].angle - segmentsAndAngles[2].angle)
      // ) {
      //   // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      //   segmentsAndAngles.unshift(segmentsAndAngles.pop()!)
      // }

      // // eslint-disable-next-line prefer-const
      // let [beforeMiddle, middle, afterMiddle] = segmentsAndAngles.map(
      //   ({ segment }) => segment
      // )

      // const afterMiddleLength = euclideanDistance(
      //   { x: afterMiddle.x1, y: afterMiddle.y1 },
      //   { x: afterMiddle.x2, y: afterMiddle.y2 }
      // )
      // const beforeMiddleLength = euclideanDistance(
      //   { x: beforeMiddle.x1, y: beforeMiddle.y1 },
      //   { x: beforeMiddle.x2, y: beforeMiddle.y2 }
      // )

      // console.log({ afterMiddleLength, beforeMiddleLength })
      // if (afterMiddleLength > beforeMiddleLength) {
      //   beforeMiddle = adjustSegmentLength(beforeMiddle, afterMiddleLength)
      // } else if (afterMiddleLength < beforeMiddleLength) {
      //   afterMiddle = adjustSegmentLength(afterMiddle, beforeMiddleLength)
      // }

      // const inferredSegment: LineSegment = {
      //   x1: afterMiddle.x2,
      //   y1: afterMiddle.y2,
      //   x2: beforeMiddle.x1,
      //   y2: beforeMiddle.y1,
      //   width: middle.width,
      // }
      // console.log({ inferredSegment })

      // return {
      //   top: partial.top ?? inferredSegment,
      //   right: partial.right ?? inferredSegment,
      //   bottom: partial.bottom ?? inferredSegment,
      //   left: partial.left ?? inferredSegment,
      // }
    }

    case 2: {
      const [a, b] = segments
      const adx = a.x1 - a.x2
      const ady = a.y1 - a.y2
      const aVertical = Math.abs(ady) > Math.abs(adx)
      const bdx = b.x1 - b.x2
      const bdy = b.y1 - b.y2
      const bVertical = Math.abs(bdy) > Math.abs(bdx)

      if (aVertical !== bVertical) {
        // a & b are perpendicular
        if (a === partial.top && b === partial.right) {
          const dxTop = partial.top.x2 - partial.top.x1
          const dyTop = partial.top.y2 - partial.top.y1
          const dxRight = partial.right.x2 - partial.right.x1
          const dyRight = partial.right.y2 - partial.right.y1
          return {
            top: partial.top,
            right: partial.right,
            bottom: {
              x1: partial.top.x2 + dxRight,
              y1: partial.top.y2 + dyRight,
              x2: partial.top.x1 + dxRight,
              y2: partial.top.y1 + dyRight,
              width: partial.top.width,
            },
            left: {
              x1: partial.right.x2 - dxTop,
              y1: partial.right.y2 + dyTop,
              x2: partial.right.x1 - dxTop,
              y2: partial.right.y1 + dyTop,
              width: partial.right.width,
            },
          }
        } else if (a === partial.right && b === partial.bottom) {
          const dxBottom = partial.bottom.x2 - partial.bottom.x1
          const dyBottom = partial.bottom.y2 - partial.bottom.y1
          const dxRight = partial.right.x2 - partial.right.x1
          const dyRight = partial.right.y2 - partial.right.y1
          return {
            top: {
              x1: partial.bottom.x2 + dxRight,
              y1: partial.bottom.y2 - dyRight,
              x2: partial.bottom.x1 + dxRight,
              y2: partial.bottom.y1 - dyRight,
              width: partial.bottom.width,
            },
            right: partial.right,
            bottom: partial.bottom,
            left: {
              x1: partial.right.x2 + dxBottom,
              y1: partial.right.y2 + dyBottom,
              x2: partial.right.x1 + dxBottom,
              y2: partial.right.y1 + dyBottom,
              width: partial.right.width,
            },
          }
        } else if (a === partial.bottom && b === partial.left) {
          const dxBottom = partial.bottom.x2 - partial.bottom.x1
          const dyBottom = partial.bottom.y2 - partial.bottom.y1
          const dxLeft = partial.left.x2 - partial.left.x1
          const dyLeft = partial.left.y2 - partial.left.y1
          return {
            top: {
              x1: partial.bottom.x2 + dxLeft,
              y1: partial.bottom.y2 + dyLeft,
              x2: partial.bottom.x1 + dxLeft,
              y2: partial.bottom.y1 + dyLeft,
              width: partial.bottom.width,
            },
            right: {
              x1: partial.left.x2 - dxBottom,
              y1: partial.left.y2 + dyBottom,
              x2: partial.left.x1 - dxBottom,
              y2: partial.left.y1 + dyBottom,
              width: partial.left.width,
            },
            bottom: partial.bottom,
            left: partial.left,
          }
        } else if (a === partial.top && b === partial.left) {
          const dxTop = partial.top.x2 - partial.top.x1
          const dyTop = partial.top.y2 - partial.top.y1
          const dxLeft = partial.left.x2 - partial.left.x1
          const dyLeft = partial.left.y2 - partial.left.y1
          return {
            top: partial.top,
            right: {
              x1: partial.left.x2 + dxTop,
              y1: partial.left.y2 + dyTop,
              x2: partial.left.x1 + dxTop,
              y2: partial.left.y1 + dyTop,
              width: partial.left.width,
            },
            bottom: {
              x1: partial.top.x2 + dxLeft,
              y1: partial.top.y2 - dyLeft,
              x2: partial.top.x1 + dxLeft,
              y2: partial.top.y1 - dyLeft,
              width: partial.top.width,
            },
            left: partial.left,
          }
        }
      }
      break
    }
  }

  return undefined
}

export function closeBoxSegmentGaps({ top, right, bottom, left }: Box): Box {
  const topLeft = computeProjectedLineIntersection(left, top)

  if (typeof topLeft !== 'string') {
    left = { ...left, x2: topLeft.x, y2: topLeft.y }
    top = { ...top, x1: topLeft.x, y1: topLeft.y }
  }

  const topRight = computeProjectedLineIntersection(top, right)

  if (typeof topRight !== 'string') {
    top = { ...top, x2: topRight.x, y2: topRight.y }
    right = { ...right, x1: topRight.x, y1: topRight.y }
  }

  const bottomRight = computeProjectedLineIntersection(right, bottom)

  if (typeof bottomRight !== 'string') {
    right = { ...right, x2: bottomRight.x, y2: bottomRight.y }
    bottom = { ...bottom, x1: bottomRight.x, y1: bottomRight.y }
  }

  const bottomLeft = computeProjectedLineIntersection(bottom, left)

  if (typeof bottomLeft !== 'string') {
    bottom = { ...bottom, x2: bottomLeft.x, y2: bottomLeft.y }
    left = { ...left, x1: bottomLeft.x, y1: bottomLeft.y }
  }

  return { top, right, bottom, left }
}

/**
 * @see https://stackoverflow.com/a/565282/549363
 */
export function computeProjectedLineIntersection(
  segment1: LineSegment | AnnotatedSegment,
  segment2: LineSegment | AnnotatedSegment,
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

  const s1 = toLineSegment(segment1)
  const s2 = toLineSegment(segment2)
  const p: Vector = { x: s1.x1, y: s1.y1 }
  const r: Vector = {
    x: s1.x2 - s1.x1,
    y: s1.y2 - s1.y1,
  }
  const q: Vector = { x: s2.x1, y: s2.y1 }
  const s: Vector = {
    x: s2.x2 - s2.x1,
    y: s2.y2 - s2.y1,
  }
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
  segment: LineSegment,
  length: number,
  direction: 'forward' | 'backward'
): LineSegment {
  const angle = computeSegmentAngle(segment)
  const dx = length * Math.cos(angle)
  const dy = length * Math.sin(angle)

  if (direction === 'forward') {
    return {
      x1: segment.x1,
      y1: segment.y1,
      x2: segment.x1 + dx,
      y2: segment.y1 + dy,
      width: segment.width,
    }
  } else {
    return {
      x1: segment.x2 - dx,
      y1: segment.y2 - dy,
      x2: segment.x2,
      y2: segment.y2,
      width: segment.width,
    }
  }
}

export function drawBoxes(
  qc: QuickCanvas,
  boxes: Iterable<Partial<Box>>,
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
      qc.line(
        { x: box.top.x1, y: box.top.y1 },
        { x: box.top.x2, y: box.top.y2 },
        { color, stroke }
      )
    }
    if (box.right) {
      qc.line(
        { x: box.right.x1, y: box.right.y1 },
        { x: box.right.x2, y: box.right.y2 },
        {
          color,
          stroke,
        }
      )
    }
    if (box.bottom) {
      qc.line(
        { x: box.bottom.x1, y: box.bottom.y1 },
        { x: box.bottom.x2, y: box.bottom.y2 },
        {
          color,
          stroke,
        }
      )
    }
    if (box.left) {
      qc.line(
        { x: box.left.x1, y: box.left.y1 },
        { x: box.left.x2, y: box.left.y2 },
        {
          color,
          stroke,
        }
      )
    }

    if (isCompleteBox(box)) {
      qc.text(
        `${Math.round(area(box))}`,
        box.top.x1 + (box.top.x2 - box.top.x1) / 2,
        box.right.y1 + (box.right.y2 - box.right.y1) / 2,
        undefined,
        undefined,
        { color }
      )
    }
  }

  return qc
}

export function filterContainedBoxes(boxes: Iterable<Box>): Set<Box> {
  return setFilter(
    boxes,
    (box, i, boxes) =>
      !boxes.some((container, j) => i !== j && boxContains(container, box))
  )
}

export function area({ top, right, bottom, left }: Box): number {
  return (
    (((top.x2 - top.x1 + bottom.x1 - bottom.x2) / 2) *
      (right.y2 - right.y1 + left.y1 - left.y2)) /
    2
  )
}

export function boxContains(container: Box, contained: Box): boolean {
  const result =
    container.top.x1 <= contained.top.x1 &&
    container.top.y1 <= contained.top.y1 &&
    container.top.x2 >= contained.top.x2 &&
    container.top.y2 <= contained.top.y2 &&
    container.right.x1 >= contained.right.x1 &&
    container.right.y1 <= contained.right.y1 &&
    container.right.x2 >= contained.right.x2 &&
    container.right.y2 >= contained.right.y2 &&
    container.bottom.x1 >= contained.bottom.x1 &&
    container.bottom.y1 >= contained.bottom.y1 &&
    container.bottom.x2 <= contained.bottom.x2 &&
    container.bottom.y2 >= contained.bottom.y2 &&
    container.left.x1 <= contained.left.x1 &&
    container.left.y1 >= contained.left.y1 &&
    container.left.x2 <= contained.left.x2 &&
    container.left.y2 <= contained.left.y2
  return result
}

export function splitIntoColumns(boxes: Iterable<Box>): LayoutColumn[] {
  const columns: Box[][] = []

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
        const columnMidX = (column[0].top.x2 + column[0].top.x1) / 2

        if (box.top.x1 < columnMidX && box.top.x2 > columnMidX) {
          // in this column
          for (let j = 0; j <= column.length; j++) {
            if (j === column.length) {
              column.push(box)
              break
            }

            if (
              column[j].left.y2 + column[j].left.y1 >
              box.left.y2 + box.left.y1
            ) {
              column.splice(j, 0, box)
              break
            }
          }

          break
        } else if (box.top.x2 < columnMidX) {
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
    if (templateColumn.length > scanColumn.length) {
      return
    }

    const mergedColumn: Box[] = []
    let templateIndex = 0
    let scanIndex = 0

    while (
      templateIndex < templateColumn.length &&
      scanIndex < scanColumn.length
    ) {
      // console.log('COLUMN', columnIndex, 'BOX', { templateIndex, scanIndex })
      let mergedBox: Box | undefined
      let mergedScanEnd = scanIndex + 1

      for (
        ;
        !mergedBox && mergedScanEnd <= scanColumn.length;
        mergedScanEnd++
      ) {
        mergedBox = matchMerge(
          template,
          templateColumn[templateIndex],
          scan,
          scanColumn.slice(scanIndex, mergedScanEnd)
        )
      }

      // console.log('merged?', !!mergedBox)
      if (!mergedBox) {
        return
      }

      mergedColumn.push(mergedBox)
      templateIndex++
      scanIndex = mergedScanEnd - 1
    }

    mergedColumns.push(mergedColumn)
  }

  return {
    width: scan.width,
    height: scan.height,
    columns: mergedColumns,
  }
}

export function boxCorners(box: Box): Corners {
  return [
    { x: box.top.x1, y: box.top.y1 },
    { x: box.top.x2, y: box.top.y2 },
    { x: box.bottom.x2, y: box.bottom.y2 },
    { x: box.bottom.x1, y: box.bottom.y1 },
  ]
}

export function matchMerge(
  template: Layout,
  templateBox: Box,
  scan: Layout,
  scanBoxes: readonly Box[],
  { allowedAreaRatioError = 0.02 } = {}
): Box | undefined {
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
    right: {
      x1: scanTop.right.x1,
      y1: scanTop.right.y1,
      x2: scanBottom.right.x2,
      y2: scanBottom.right.y2,
      width: (scanTop.right.width + scanBottom.right.width) / 2,
    },
    bottom: scanBottom.bottom,
    left: {
      x1: scanBottom.left.x1,
      y1: scanBottom.left.y1,
      x2: scanTop.left.x2,
      y2: scanTop.left.y2,
      width: (scanTop.left.width + scanBottom.left.width) / 2,
    },
  }
}
