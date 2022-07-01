import { assert, integers, map, zip, zipMin } from '@votingworks/utils';
import { Debugger, noDebug } from './debug';
import {
  Bit,
  CompleteTimingMarks,
  PartialTimingMarks,
  Point,
  PossibleOptionBubblesGrid,
  Rect,
  Segment,
  Size,
} from './types';
import {
  angleBetweenPoints,
  calculateIntersection,
  centerOfRect,
  checkApproximatelyColinear,
  closestPointOnLineSegmentToPoint,
  distance,
  getRectSegmentIntersectionPoints,
  heading,
  makeRect,
  median,
  segmentIntersectionWithRect,
  vec,
} from './utils';

/**
 * Successful result of a call to {@link findBestFitLineSegmentThrough}.
 */
export interface BestFitLineSegmentResult {
  /**
   * The best-fit line segment, i.e. the line segment through which the greatest
   * number of rectangles could be passed.
   */
  readonly lineSegment: Segment;

  /**
   * The rectangles that {@link lineSegment} passes through.
   */
  readonly rects: Rect[];
}

/**
 * Renders the timing marks to a debugger.
 */
export function renderTimingMarks(
  debug: Debugger,
  timingMarks: PartialTimingMarks
): void {
  if (!debug.isEnabled()) {
    return;
  }

  for (const [i, rect] of timingMarks.left.entries()) {
    const midY = rect.y + rect.height / 2;
    debug
      .rect(rect.x, rect.y, rect.width, rect.height, 'green')
      .text(rect.maxX + 5, midY, `${i}`, 'green');
  }

  for (const [i, rect] of timingMarks.right.entries()) {
    const midY = rect.y + rect.height / 2;
    debug
      .rect(rect.x, rect.y, rect.width, rect.height, 'lightgreen')
      .text(rect.minX - 15, midY, `${i}`, 'lightgreen');
  }

  for (const [i, rect] of timingMarks.top.entries()) {
    const midX = rect.x + rect.width / 2;
    debug
      .rect(rect.x, rect.y, rect.width, rect.height, 'purple')
      .text(midX, rect.y, `${i}`, 'purple');
  }

  for (const [i, rect] of timingMarks.bottom.entries()) {
    const midX = rect.x + rect.width / 2;
    debug
      .rect(rect.x, rect.y, rect.width, rect.height, 'pink')
      .text(midX, rect.minY + 15, `${i}`, 'pink');
  }

  const minX = [...timingMarks.left, ...timingMarks.right].reduce(
    (min, rect) => Math.min(min, rect.minX),
    Infinity
  );
  const maxX = [...timingMarks.left, ...timingMarks.right].reduce(
    (max, rect) => Math.max(max, rect.maxX),
    0
  );
  const minY = [...timingMarks.top, ...timingMarks.bottom].reduce(
    (min, rect) => Math.min(min, rect.minY),
    Infinity
  );
  const maxY = [...timingMarks.top, ...timingMarks.bottom].reduce(
    (max, rect) => Math.max(max, rect.maxY),
    0
  );
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  debug.text(midX, midY, `left: ${timingMarks.left.length}`, 'green');
  debug.text(midX, midY + 15, `right: ${timingMarks.right.length}`, 'blue');
  debug.text(midX, midY + 30, `top: ${timingMarks.top.length}`, 'purple');
  debug.text(midX, midY + 45, `bottom: ${timingMarks.bottom.length}`, 'pink');

  for (const rect of [
    timingMarks.topLeft,
    timingMarks.topRight,
    timingMarks.bottomLeft,
    timingMarks.bottomRight,
  ]) {
    if (rect) {
      debug.rect(rect.x, rect.y, rect.width, rect.height, 'cyan');
    }
  }
}

/**
 * Finds a line segment through which the greatest number of rectangles from
 * {@link rects} could be passed.
 */
export function findBestFitLineSegmentThrough({
  rects,
  canvasSize,
  expectedAngle,
  angleTolerance = 0,
  debug = noDebug(),
}: {
  rects: readonly Rect[];
  canvasSize: Size;
  expectedAngle?: number;
  angleTolerance?: number;
  debug?: Debugger;
}): BestFitLineSegmentResult | undefined {
  const canvasRect = makeRect({
    minX: 0,
    minY: 0,
    maxX: canvasSize.width - 1,
    maxY: canvasSize.height - 1,
  });

  let bestFitRectsInSegment: Rect[] = [];
  let bestFitSegment: Segment | undefined;
  let bestFitScore = 0;

  /* istanbul ignore next */
  if (debug) {
    for (const rect of rects) {
      debug.rect(rect.x, rect.y, rect.width, rect.height, 'blue');
    }
  }

  for (let i = 0; i < rects.length; i += 1) {
    const rectFrom = rects[i] as Rect;

    for (let j = i + 1; j < rects.length; j += 1) {
      const rectTo = rects[j] as Rect;
      const rectFromCenter = centerOfRect(rectFrom);
      const rectToCenter = centerOfRect(rectTo);

      if (typeof expectedAngle === 'number') {
        const angleOfCenterToCenterSegment =
          rectFromCenter.y < rectToCenter.y
            ? angleBetweenPoints(rectFromCenter, rectToCenter)
            : angleBetweenPoints(rectToCenter, rectFromCenter);

        if (
          !checkApproximatelyColinear(
            angleOfCenterToCenterSegment,
            expectedAngle,
            angleTolerance
          )
        ) {
          continue;
        }
      }

      const centerToCenterSegment: Segment = {
        from: rectFromCenter,
        to: rectToCenter,
      };
      const segment = segmentIntersectionWithRect(
        canvasRect,
        centerToCenterSegment,
        { bounded: false }
      );
      assert(
        segment,
        `no intersection between rect={x: ${canvasRect.x}, y: ${canvasRect.y}, width: ${canvasRect.width}, height: ${canvasRect.height}} and segment={from: {x: ${centerToCenterSegment.from.x}, y: ${centerToCenterSegment.from.y}}, to: {x: ${centerToCenterSegment.to.x}, y: ${centerToCenterSegment.to.y}}}`
      );

      const rectsInSegment = rects.filter(
        (rect) => getRectSegmentIntersectionPoints(rect, segment).length > 0
      );
      const score = rectsInSegment.reduce((acc, rect) => {
        const rectCenter = centerOfRect(rect);
        const segmentPointClosestToCenter = closestPointOnLineSegmentToPoint(
          segment,
          rectCenter
        );
        const vectorFromCenterToSegment = heading(
          rectCenter,
          segmentPointClosestToCenter
        );
        const xError = Math.abs(vectorFromCenterToSegment.x);
        const yError = Math.abs(vectorFromCenterToSegment.y);
        const xScore = Math.max(1 - xError / rect.width, 0);
        const yScore = Math.max(1 - yError / rect.height, 0);
        return acc + xScore + yScore;
      }, 0);

      if (score > bestFitScore) {
        bestFitRectsInSegment = rectsInSegment;
        bestFitSegment = segment;
        bestFitScore = score;
      }
    }
  }

  /* istanbul ignore next */
  if (debug.isEnabled() && bestFitSegment) {
    debug.line(
      bestFitSegment.from.x,
      bestFitSegment.from.y,
      bestFitSegment.to.x,
      bestFitSegment.to.y,
      'green'
    );

    for (const rect of bestFitRectsInSegment) {
      debug
        .line(rect.minX, rect.minY, rect.maxX, rect.minY, 'green')
        .line(rect.maxX, rect.minY, rect.maxX, rect.maxY, 'green')
        .line(rect.maxX, rect.maxY, rect.minX, rect.maxY, 'green')
        .line(rect.minX, rect.maxY, rect.minX, rect.minY, 'green');
    }
  }

  return !bestFitSegment
    ? undefined
    : {
        lineSegment: bestFitSegment,
        rects: bestFitRectsInSegment,
      };
}

/**
 * Compute the binary data from the bottom timing marks. In the event that the
 * bottom timing marks are actually at the top of the image (i.e. the image is
 * upside down), the resulting bits are in reverse order.
 *
 * @example
 *
 *   🀰 = timing mark   🀱 = missing timing mark
 *
 *   🀰 🀰 🀰 🀰 🀰 🀰 🀰 🀰 🀰 🀰 🀰 🀰 🀰 🀰 🀰 🀰 🀰 🀰
 *   🀰                                         🀰
 *   🀰                                         🀰
 *   …                                          …
 *   🀰                                         🀰
 *   🀰 🀰 🀰 🀱 🀰 🀱 🀰 🀱 🀱 🀱 🀱 🀰 🀰 🀰 🀰 🀰 🀰 🀰
 *
 *   This is the binary data, from left to right:
 *   [1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]
 */
export function decodeBottomRowTimingMarks(
  timingMarks: PartialTimingMarks
): Bit[] | undefined {
  if (timingMarks.bottom.length < 2 || timingMarks.top.length < 2) {
    return;
  }

  const { top } = timingMarks;
  const barcodeTimingMarkCount = top.length - 2;
  const bottomLeftToRight = [...timingMarks.bottom].sort(
    (a, b) => a.minX - b.minX
  );

  // Discard outer marks.
  const leftCorner = bottomLeftToRight.shift();
  assert(leftCorner, 'bottom left corner not found');
  const rightCorner = bottomLeftToRight.pop();
  assert(rightCorner, 'bottom right corner not found');

  // Determine the median distance from mark start to mark start.
  const distanceSeparatingStartsOfTopTimingMarks = median(
    top.slice(1, -1).map((shape, i) => (top[i + 2] as Rect).minX - shape.minX)
  );

  const bitOffsets = new Set<number>();

  // Assuming top marks and bottom marks are aligned, find the bit offset
  // for each mark on the bottom row.
  for (const rect of bottomLeftToRight) {
    const bitOffset =
      Math.round(
        (rect.maxX - leftCorner.maxX) / distanceSeparatingStartsOfTopTimingMarks
      ) - 1;
    bitOffsets.add(bitOffset);
  }

  // Compute the bits from the bit offsets, 1 for mark present, 0 for mark
  // absent.
  const bits: Bit[] = [];
  for (let i = 0; i < barcodeTimingMarkCount; i += 1) {
    bits.push(bitOffsets.has(i) ? 1 : 0);
  }

  return bits;
}

/**
 * Interpolates missing rectangles in an aligned series of rectangles.
 */
export function interpolateMissingRects(
  sortedRects: readonly Rect[],
  {
    expectedDistance: expectedDistanceParam,
    debug = noDebug(),
  }: { expectedDistance?: number; debug?: Debugger } = {}
): Rect[] {
  if (sortedRects.length < 2) {
    return [...sortedRects];
  }

  const originalColor = 'black';
  const interpolatedColor = 'red';

  const result: Rect[] = [...sortedRects];
  const expectedDistance =
    expectedDistanceParam ??
    median(
      result
        .slice(1)
        .map((shape, i) =>
          distance(centerOfRect(shape), centerOfRect(result[i] as Rect))
        )
    );
  assert(expectedDistance > 0, 'expectedDistance must be positive');

  const minX = Math.min(...result.map((rect) => rect.minX));
  const maxY = Math.max(...result.map((rect) => rect.maxY));
  const buffer = 10;
  const handleSize = 3;

  debug
    .line(
      minX + buffer,
      maxY + buffer,
      minX + buffer,
      maxY + buffer + handleSize - 1,
      'black'
    )
    .line(
      minX + buffer,
      maxY + buffer + Math.floor(handleSize / 2),
      minX + buffer + expectedDistance,
      maxY + buffer + Math.floor(handleSize / 2),
      'black'
    )
    .line(
      minX + buffer + expectedDistance,
      maxY + buffer,
      minX + buffer + expectedDistance,
      maxY + buffer + handleSize - 1,
      'black'
    )
    .text(
      minX + buffer,
      maxY + buffer * 2 + handleSize,
      `expected distance = ${expectedDistance}`,
      'black'
    )
    .text(
      minX + buffer,
      maxY + buffer * 4 + handleSize,
      `${interpolatedColor} = interpolated`,
      interpolatedColor
    )
    .text(
      minX + buffer,
      maxY + buffer * 6 + handleSize,
      `${originalColor} = original`,
      'black'
    );

  for (const rect of sortedRects) {
    debug.rect(rect.x, rect.y, rect.width, rect.height, originalColor);
  }

  for (let i = 1; i < result.length; i += 1) {
    const lastRect = result[i - 1] as Rect;
    const thisRect = result[i] as Rect;

    const centerOfLastRect = centerOfRect(lastRect);
    const centerOfThisRect = centerOfRect(thisRect);
    const distanceFromLastRect = distance(centerOfLastRect, centerOfThisRect);
    const stepsToLastRect = Math.round(distanceFromLastRect / expectedDistance);
    const angleFromLastRect = Math.atan2(
      centerOfThisRect.y - centerOfLastRect.y,
      centerOfThisRect.x - centerOfLastRect.x
    );

    for (let step = 1; step < stepsToLastRect; step += 1) {
      const offsetFromLastRect = vec(
        (step / stepsToLastRect) *
          distanceFromLastRect *
          Math.cos(angleFromLastRect),
        (step / stepsToLastRect) *
          distanceFromLastRect *
          Math.sin(angleFromLastRect)
      );
      const inferredRect = makeRect({
        minX: Math.round(lastRect.minX + offsetFromLastRect.x),
        minY: Math.round(lastRect.minY + offsetFromLastRect.y),
        maxX: Math.round(lastRect.maxX + offsetFromLastRect.x),
        maxY: Math.round(lastRect.maxY + offsetFromLastRect.y),
      });
      result.splice(i + step - 1, 0, inferredRect);

      debug
        .rect(
          inferredRect.x,
          inferredRect.y,
          inferredRect.width,
          inferredRect.height,
          interpolatedColor
        )
        .text(
          inferredRect.x,
          inferredRect.maxY + 10,
          `${step}`,
          interpolatedColor
        );
    }
  }

  return result;
}

/**
 * Infers the locations of timing marks that should be present but were not
 * found. This is primarily used to infer the timing marks for the bottom row
 * but can also be used to infer the timing marks for the other border edges.
 */
export function interpolateMissingTimingMarks(
  timingMarks: PartialTimingMarks,
  { debug = noDebug() }: { debug?: Debugger } = {}
): CompleteTimingMarks {
  const {
    top,
    bottom,
    left,
    right,
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
  } = timingMarks;
  assert(
    topLeft && topRight && bottomLeft && bottomRight,
    'cannot infer missing timing marks without corners'
  );

  const expectedVerticalTimingMarkSeparationDistance = median(
    left
      .slice(1)
      .map((shape, i) =>
        distance(centerOfRect(shape), centerOfRect(left[i] as Rect))
      )
  );
  const expectedHorizontalTimingMarkSeparationDistance = median(
    top
      .slice(1)
      .map((shape, i) =>
        distance(centerOfRect(shape), centerOfRect(top[i] as Rect))
      )
  );

  /* istanbul ignore next */
  debug?.group('top');

  const interpolatedTop = interpolateMissingRects(top, {
    expectedDistance: expectedHorizontalTimingMarkSeparationDistance,
    debug,
  });

  /* istanbul ignore next */
  debug?.groupEnd('top');

  /* istanbul ignore next */
  debug?.group('bottom');

  const interpolatedBottom = interpolateMissingRects(bottom, {
    expectedDistance: expectedHorizontalTimingMarkSeparationDistance,
    debug,
  });

  /* istanbul ignore next */
  debug?.groupEnd('bottom');

  /* istanbul ignore next */
  debug?.group('left');

  const interpolatedLeft = interpolateMissingRects(left, {
    expectedDistance: expectedVerticalTimingMarkSeparationDistance,
    debug,
  });

  /* istanbul ignore next */
  debug?.groupEnd('left');

  /* istanbul ignore next */
  debug?.group('right');

  const interpolatedRight = interpolateMissingRects(right, {
    expectedDistance: expectedVerticalTimingMarkSeparationDistance,
    debug,
  });

  /* istanbul ignore next */
  debug?.groupEnd('right');

  const result: CompleteTimingMarks = {
    top: interpolatedTop,
    bottom: interpolatedBottom,
    left: interpolatedLeft,
    right: interpolatedRight,
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
  };

  renderTimingMarks(debug, result);

  return result;
}

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

  const columnAngles = [
    ...map(zip(top, bottom), ([topRect, bottomRect]) =>
      Math.atan2(
        centerOfRect(bottomRect).y - centerOfRect(topRect).y,
        centerOfRect(bottomRect).x - centerOfRect(topRect).x
      )
    ),
  ];
  const rowAngles = [
    ...map(zip(left, right), ([leftRect, rightRect]) =>
      Math.atan2(
        centerOfRect(rightRect).y - centerOfRect(leftRect).y,
        centerOfRect(rightRect).x - centerOfRect(leftRect).x
      )
    ),
  ];

  /* istanbul ignore next */
  if (debug.isEnabled()) {
    for (const [topRect, bottomRect] of zip(top, bottom)) {
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

    for (const [leftRect, rightRect] of zip(left, right)) {
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

  for (const [leftShape, rowAngle, column] of zipMin(
    left,
    rowAngles,
    integers()
  )) {
    const leftShapeCenter = centerOfRect(leftShape);
    const intersections: Point[] = [];

    for (const [topShape, columnAngle, row] of zipMin(
      top,
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
