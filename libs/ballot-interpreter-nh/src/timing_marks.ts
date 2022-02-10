import { assert, integers, map, zip, zipMin } from '@votingworks/utils';
import { BallotCardGeometry } from './accuvote';
import { Debugger } from './debug';
import {
  Bit,
  CompleteTimingMarks,
  PartialTimingMarks,
  Point,
  Rect,
  Segment,
  Size,
  PossibleOptionBubblesGrid,
} from './types';
import {
  calculateIntersection,
  centerOfRect,
  closestPointOnLineSegmentToPoint,
  distance,
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
  readonly rects: Set<Rect>;
}

/**
 * Finds a line segment through which the greatest number of rectangles from
 * {@link rects} could be passed.
 */
export function findBestFitLineSegmentThrough({
  rects: rectIterable,
  canvasSize,
  debug,
}: {
  rects: Iterable<Rect>;
  canvasSize: Size;
  debug?: Debugger;
}): BestFitLineSegmentResult | undefined {
  debug?.layer(findBestFitLineSegmentThrough.name);

  const canvasRect = makeRect({
    minX: 0,
    minY: 0,
    maxX: canvasSize.width - 1,
    maxY: canvasSize.height - 1,
  });

  let bestFitRectsInSegment = new Set<Rect>();
  let bestFitSegment: Segment | undefined;
  let bestFitScore = 0;
  const rects = [...rectIterable];

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

      const rectsInSegment = rects.filter((rect) =>
        segmentIntersectionWithRect(rect, segment, { bounded: true })
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
        const xScore = 1 - xError / rect.width;
        const yScore = 1 - yError / rect.height;
        // if (debug && i === 0 && j === 1) {
        //   console.log({ rectIndex, xScore, yScore });
        // }
        return acc + xScore + yScore;
      }, 0);

      if (score > bestFitScore) {
        bestFitRectsInSegment = new Set(rectsInSegment);
        bestFitSegment = segment;
        bestFitScore = score;
      }

      /* istanbul ignore next */
      //   if (debug) {
      //     debug.layer(`from ${i} to ${j}`);
      //     for (const rect of rectsInSegment) {
      //       const rectCenter = centerOfRect(rect);
      //       const closestPointOnSegmentToCenter =
      //         closestPointOnLineSegmentToPoint(segment, rectCenter);
      //       debug.line(
      //         closestPointOnSegmentToCenter.x,
      //         closestPointOnSegmentToCenter.y,
      //         rectCenter.x,
      //         rectCenter.y,
      //         'cyan'
      //       );
      //     }
      //     debug.line(
      //       segment.from.x,
      //       segment.from.y,
      //       segment.to.x,
      //       segment.to.y,
      //       'red'
      //     );
      //     debug.layerEnd(`from ${i} to ${j}`);
      //   }
    }
  }

  if (debug && bestFitSegment) {
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

  debug?.layerEnd(findBestFitLineSegmentThrough.name);
  return !bestFitSegment
    ? undefined
    : {
        lineSegment: bestFitSegment,
        rects: bestFitRectsInSegment,
      };
}

/**
 * Groups rects into left/right/top/bottom groups of timing marks.
 */
export function findBorder({
  geometry,
  rects,
  debug,
}: {
  geometry: BallotCardGeometry;
  rects: Iterable<Rect>;
  debug?: Debugger;
}): PartialTimingMarks | undefined {
  debug?.layer(findBorder.name);

  const { contentArea } = geometry;
  const bottom = new Set<Rect>();
  const left = new Set<Rect>();
  const right = new Set<Rect>();
  const top = new Set<Rect>();

  // Step 1: Separate into left & right search areas
  const rectsLeftToRight = [...rects].sort((a, b) => a.x - b.x);
  const midX = contentArea.x + contentArea.width / 2;
  const leftCandidates = rectsLeftToRight.filter((rect) => rect.x < midX);
  const rightCandidates = rectsLeftToRight.filter((rect) => rect.x >= midX);

  // Step 2: Find best fit line segment through left & right search areas,
  //         where the best fit line segment is the one with the most rects.
  const leftSideBestFitLineResult = findBestFitLineSegmentThrough({
    canvasSize: geometry.canvasSize,
    rects: leftCandidates,
    debug,
  });
  const rightSideBestFitLineResult = findBestFitLineSegmentThrough({
    canvasSize: geometry.canvasSize,
    rects: rightCandidates,
    debug,
  });

  if (leftSideBestFitLineResult) {
    for (const rect of leftSideBestFitLineResult.rects) {
      left.add(rect);
    }
  }

  if (rightSideBestFitLineResult) {
    for (const rect of rightSideBestFitLineResult.rects) {
      right.add(rect);
    }
  }

  /* istanbul ignore next */
  if (debug) {
    for (const [side, result, color] of [
      ['left', leftSideBestFitLineResult, '#00ff0077'],
      ['right', rightSideBestFitLineResult, '#0000ff77'],
    ] as const) {
      if (!result) {
        continue;
      }
      debug
        .layer(side)
        .line(
          result.lineSegment.from.x,
          result.lineSegment.from.y,
          result.lineSegment.to.x,
          result.lineSegment.to.y,
          color
        );

      for (const rect of result.rects) {
        debug.rect(rect.x, rect.y, rect.width, rect.height, color);
      }

      debug.layerEnd(side);
    }
  }

  const leftSortedTopToBottom = [...left].sort((a, b) => a.minY - b.minY);

  debug?.layer('trim left');
  while (leftSortedTopToBottom.length > geometry.gridSize.height) {
    const first = leftSortedTopToBottom[0];
    const second = leftSortedTopToBottom[1];
    const last = leftSortedTopToBottom[leftSortedTopToBottom.length - 1];
    const penultimate = leftSortedTopToBottom[leftSortedTopToBottom.length - 2];

    if (first && second && last && penultimate) {
      const distanceFromFirstToSecond = distance(
        centerOfRect(first),
        centerOfRect(second)
      );
      const distanceFromLastToPenultimate = distance(
        centerOfRect(last),
        centerOfRect(penultimate)
      );

      const removed =
        distanceFromFirstToSecond > distanceFromLastToPenultimate
          ? leftSortedTopToBottom.shift()
          : leftSortedTopToBottom.pop();
      if (debug && removed) {
        debug.rect(
          removed.x,
          removed.y,
          removed.width,
          removed.height,
          '#ff000077'
        );
      }
    }
  }
  debug?.layerEnd('trim left');

  const topLeft = leftSortedTopToBottom[0];
  const bottomLeft = leftSortedTopToBottom[leftSortedTopToBottom.length - 1];
  if (!topLeft || !bottomLeft) {
    debug?.layerEnd(findBorder.name);
    return;
  }

  const rightSortedTopToBottom = [...right].sort((a, b) => a.minY - b.minY);

  debug?.layer('trim right');
  while (rightSortedTopToBottom.length > geometry.gridSize.height) {
    const first = rightSortedTopToBottom[0];
    const second = rightSortedTopToBottom[1];
    const last = rightSortedTopToBottom[rightSortedTopToBottom.length - 1];
    const penultimate =
      rightSortedTopToBottom[rightSortedTopToBottom.length - 2];

    if (first && second && last && penultimate) {
      const distanceFromFirstToSecond = distance(
        centerOfRect(first),
        centerOfRect(second)
      );
      const distanceFromLastToPenultimate = distance(
        centerOfRect(last),
        centerOfRect(penultimate)
      );

      const removed =
        distanceFromFirstToSecond > distanceFromLastToPenultimate
          ? rightSortedTopToBottom.shift()
          : rightSortedTopToBottom.pop();
      if (debug && removed) {
        debug.rect(
          removed.x,
          removed.y,
          removed.width,
          removed.height,
          '#ff000077'
        );
      }
    }
  }
  debug?.layerEnd('trim right');

  const topRight = rightSortedTopToBottom[0];
  const bottomRight = rightSortedTopToBottom[rightSortedTopToBottom.length - 1];
  if (!topRight || !bottomRight) {
    debug?.layerEnd(findBorder.name);
    return;
  }

  // Step 3: Find top & bottom by finding rects that intersect the line segment
  //         between the top/bottom left and top/bottom right rects.
  const topLineSegment: Segment = {
    from: centerOfRect(topLeft),
    to: centerOfRect(topRight),
  };
  const expandedTopLineSegment = segmentIntersectionWithRect(
    contentArea,
    topLineSegment,
    { bounded: false }
  );
  if (!expandedTopLineSegment) {
    debug?.layerEnd(findBorder.name);
    return;
  }

  for (const rect of rects) {
    if (
      segmentIntersectionWithRect(rect, expandedTopLineSegment, {
        bounded: true,
      })
    ) {
      top.add(rect);
    }
  }

  /* istanbul ignore next */
  if (debug) {
    debug
      .layer('top')
      .line(
        expandedTopLineSegment.from.x,
        expandedTopLineSegment.from.y,
        expandedTopLineSegment.to.x,
        expandedTopLineSegment.to.y,
        'purple'
      );

    for (const rect of top) {
      debug.rect(rect.x, rect.y, rect.width, rect.height, '#80008077');
    }

    debug.layerEnd('top');
  }

  const bottomLineSegment: Segment = {
    from: centerOfRect(bottomLeft),
    to: centerOfRect(bottomRight),
  };
  const expandedBottomLineSegment = segmentIntersectionWithRect(
    contentArea,
    bottomLineSegment,
    { bounded: false }
  );
  if (!expandedBottomLineSegment) {
    debug?.layerEnd(findBorder.name);
    return;
  }

  for (const rect of rects) {
    if (
      segmentIntersectionWithRect(rect, expandedBottomLineSegment, {
        bounded: true,
      })
    ) {
      bottom.add(rect);
    }
  }

  /* istanbul ignore next */
  if (debug) {
    debug
      .layer('bottom')
      .line(
        expandedBottomLineSegment.from.x,
        expandedBottomLineSegment.from.y,
        expandedBottomLineSegment.to.x,
        expandedBottomLineSegment.to.y,
        '#ffff0077'
      );

    for (const rect of bottom) {
      debug.rect(rect.x, rect.y, rect.width, rect.height, '#ffff0077');
    }

    debug.layerEnd('bottom');
  }

  debug
    ?.layer('topLeft')
    .rect(topLeft.x, topLeft.y, topLeft.width, topLeft.height, '#00ffff77')
    .layerEnd('topLeft')
    .layer('bottomLeft')
    .rect(
      bottomLeft.x,
      bottomLeft.y,
      bottomLeft.width,
      bottomLeft.height,
      '#00ffff77'
    )
    .layerEnd('bottomLeft')
    .layer('topRight')
    .rect(topRight.x, topRight.y, topRight.width, topRight.height, '#00ffff77')
    .layerEnd('topRight')
    .layer('bottomRight')
    .rect(
      bottomRight.x,
      bottomRight.y,
      bottomRight.width,
      bottomRight.height,
      '#00ffff77'
    )
    .layerEnd('bottomRight')
    .layerEnd(findBorder.name);

  return {
    bottom: [...bottom].sort((a, b) => a.minX - b.minX),
    left: leftSortedTopToBottom,
    right: rightSortedTopToBottom,
    top: [...top].sort((a, b) => a.minX - b.minX),
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
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
  const rotated = (top[0] as Rect).minY > (bottomLeftToRight[0] as Rect).minY;

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

  return rotated ? bits.reverse() : bits;
}

/**
 * Interpolates missing rectangles in an aligned series of rectangles.
 */
export function interpolateMissingRects(
  sortedRects: readonly Rect[],
  {
    expectedDistance: expectedDistanceParam,
    debug,
  }: { expectedDistance?: number; debug?: Debugger } = {}
): Rect[] {
  if (sortedRects.length < 2) {
    return [...sortedRects];
  }

  const originalColor = 'black';
  const interpolatedColor = 'red';
  debug?.layer(interpolateMissingRects.name);

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

  /* istanbul ignore next */
  if (debug) {
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

      debug?.rect(
        inferredRect.x,
        inferredRect.y,
        inferredRect.width,
        inferredRect.height,
        interpolatedColor
      );
    }
  }

  debug?.layerEnd(interpolateMissingRects.name);
  return result;
}

/**
 * Infers the locations of timing marks that should be present but were not
 * found. This is primarily used to infer the timing marks for the bottom row
 * but can also be used to infer the timing marks for the other border edges.
 */
export function interpolateMissingTimingMarks(
  timingMarks: PartialTimingMarks,
  { debug }: { debug?: Debugger } = {}
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

  const interpolatedTop = interpolateMissingRects(top, {
    expectedDistance: expectedHorizontalTimingMarkSeparationDistance,
    debug,
  });
  const interpolatedBottom = interpolateMissingRects(bottom, {
    expectedDistance: expectedHorizontalTimingMarkSeparationDistance,
    debug,
  });
  const interpolatedLeft = interpolateMissingRects(left, {
    expectedDistance: expectedVerticalTimingMarkSeparationDistance,
    debug,
  });
  const interpolatedRight = interpolateMissingRects(right, {
    expectedDistance: expectedVerticalTimingMarkSeparationDistance,
    debug,
  });

  return {
    top: interpolatedTop,
    bottom: interpolatedBottom,
    left: interpolatedLeft,
    right: interpolatedRight,
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
  };
}

/**
 * Computes the location of each possible option based on the location of the
 * timing marks along the edge.
 */
export function computeTimingMarkGrid(
  completeTimingMarks: CompleteTimingMarks,
  { debug }: { debug?: Debugger } = {}
): PossibleOptionBubblesGrid {
  debug?.layer(computeTimingMarkGrid.name);

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
  console.log({ rotated });
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
  if (debug) {
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

      debug?.rect(intersection.x - 1, intersection.y - 1, 3, 3, '#0000ff');
    }

    rows.push(intersections);
  }

  debug?.layerEnd(computeTimingMarkGrid.name);
  return { rows };
}

/**
 * Renders the timing marks to a debugger.
 */
export function renderTimingMarks(
  debug: Debugger,
  timingMarks: PartialTimingMarks
): void {
  for (const [i, rect] of timingMarks.left.entries()) {
    debug
      .rect(rect.x, rect.y, rect.width, rect.height, 'green')
      .text(rect.x, rect.y, `${i}`, 'green');
  }

  for (const [i, rect] of timingMarks.right.entries()) {
    debug
      .rect(rect.x, rect.y, rect.width, rect.height, 'blue')
      .text(rect.x, rect.y, `${i}`, 'blue');
  }

  for (const [i, rect] of timingMarks.top.entries()) {
    debug
      .rect(rect.x, rect.y, rect.width, rect.height, 'purple')
      .text(rect.x, rect.y, `${i}`, 'purple');
  }

  for (const [i, rect] of timingMarks.bottom.entries()) {
    debug
      .rect(rect.x, rect.y, rect.width, rect.height, 'yellow')
      .text(rect.x, rect.y, `${i}`, 'yellow');
  }

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
