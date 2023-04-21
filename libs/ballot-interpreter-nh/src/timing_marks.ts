import { assert, integers, iter } from '@votingworks/basics';
import { Debugger, noDebug } from '@votingworks/image-utils';
import {
  CompleteTimingMarks,
  Point,
  PossibleOptionBubblesGrid,
  Rect,
} from './types';
import { calculateIntersection, centerOfRect } from './utils';

/**
 * Computes the location of each possible option based on the location of the
 * timing marks along the edge.
 */
export function computeTimingMarkGrid(
  completeTimingMarks: CompleteTimingMarks,
  { debug = noDebug() }: { debug?: Debugger } = {}
): PossibleOptionBubblesGrid {
  const rotated =
    completeTimingMarks.bottomLeft.y < completeTimingMarks.topLeft.y;
  const xComparator: (a: Rect, b: Rect) => number = rotated
    ? (a, b) => b.x - a.x
    : (a, b) => a.x - b.x;
  const yComparator: (a: Rect, b: Rect) => number = rotated
    ? (a, b) => b.y - a.y
    : (a, b) => a.y - b.y;
  const top = [...completeTimingMarks.top].sort(xComparator);
  const bottom = [...completeTimingMarks.bottom].sort(xComparator);
  const left = [...completeTimingMarks.left].sort(yComparator);
  const right = [...completeTimingMarks.right].sort(yComparator);
  assert(
    top.length === bottom.length,
    `top and bottom must be the same length (${top.length} vs ${bottom.length})`
  );
  assert(
    left.length === right.length,
    `left and right must be the same length (${left.length} vs ${right.length})`
  );

  const columnAngles = iter(top)
    .zip(bottom)
    .map(([topRect, bottomRect]) =>
      Math.atan2(
        centerOfRect(bottomRect).y - centerOfRect(topRect).y,
        centerOfRect(bottomRect).x - centerOfRect(topRect).x
      )
    )
    .toArray();
  const rowAngles = iter(left)
    .zip(right)
    .map(([leftRect, rightRect]) =>
      Math.atan2(
        centerOfRect(rightRect).y - centerOfRect(leftRect).y,
        centerOfRect(rightRect).x - centerOfRect(leftRect).x
      )
    )
    .toArray();

  /* istanbul ignore next */
  if (debug.isEnabled()) {
    for (const [topRect, bottomRect] of iter(top).zip(bottom)) {
      const topRectCenter = centerOfRect(topRect);
      const bottomRectCenter = centerOfRect(bottomRect);

      debug.line(
        topRectCenter.x,
        topRectCenter.y,
        bottomRectCenter.x,
        bottomRectCenter.y,
        'red'
      );
    }

    for (const [leftRect, rightRect] of iter(left).zip(right)) {
      const leftRectCenter = centerOfRect(leftRect);
      const rightRectCenter = centerOfRect(rightRect);

      debug.line(
        leftRectCenter.x,
        leftRectCenter.y,
        rightRectCenter.x,
        rightRectCenter.y,
        'green'
      );
    }
  }

  const rows: Array<Point[]> = [];

  for (const [leftShape, rowAngle, column] of iter(left).zipMin(
    rowAngles,
    integers()
  )) {
    const leftShapeCenter = centerOfRect(leftShape);
    const intersections: Point[] = [];

    for (const [topShape, columnAngle, row] of iter(top).zipMin(
      columnAngles,
      integers()
    )) {
      const topShapeCenter = centerOfRect(topShape);

      // compute intersection of lines from top and left shapes
      const intersection = calculateIntersection(
        topShapeCenter,
        columnAngle,
        leftShapeCenter,
        rowAngle
      );
      assert(
        intersection,
        `intersection not found for row ${row} and column ${column}`
      );
      intersections.push(intersection);

      debug.rect(intersection.x - 1, intersection.y - 1, 3, 3, '#0000ff');
    }

    rows.push(intersections);
  }

  return { rows };
}
