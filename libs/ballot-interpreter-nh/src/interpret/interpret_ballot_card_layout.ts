import {
  getImageChannelCount,
  otsu,
  rotate180,
} from '@votingworks/image-utils';
import { assert } from '@votingworks/utils';
import { decodeTimingMarkBits, getSearchInset } from '../accuvote';
import { Debugger, noDebug } from '../debug';
import {
  BestFitLineSegmentResult,
  computeTimingMarkGrid,
  decodeBottomRowTimingMarks,
  findBestFitLineSegmentThrough,
  interpolateMissingTimingMarks,
  renderTimingMarks,
} from '../timing_marks';
import {
  BackMarksMetadata,
  BallotCardGeometry,
  BallotCardOrientation,
  CompleteTimingMarks,
  FrontMarksMetadata,
  PartialTimingMarks,
  Point,
  PossibleOptionBubblesGrid,
  Rect,
  Segment,
  Size,
} from '../types';
import {
  centerOfRect,
  checkApproximatelyColinear,
  degreesToRadians,
  distance,
  extendLineSegmentToLength,
  heading,
  intersectionOfLineSegments,
  loc,
  makeRect,
  normalizeHalfAngle,
  radiansToDegrees,
  rectContainsPoint,
  rectsOverlap,
  vectorAngle,
} from '../utils';

/**
 * The maximum rotation we might expect for a ballot card. In practice it should
 * be less than this.
 */
const MAX_ROTATION = degreesToRadians(5);

/**
 * The maximum error we'll allow when comparing the angle of the sides of a
 * ballot card vs the angle of the top and bottom of the card. We expect them
 * to be 90 degrees apart, but allow up to this value for error.
 */
const MAX_ROTATION_ERROR = degreesToRadians(3);

/**
 * Convenience value for the angle between orthogonal lines.
 */
const NINETY_DEGREES = degreesToRadians(90);

/**
 * Scans an image vertically within a given rectangle for areas that look like
 * gaps between timing marks. Each returned rectangle represents possible
 * whitespace between timing marks. Use this to find the left and right timing
 * marks on a ballot card.
 */
function verticalTimingMarkGapScan(
  imageData: ImageData,
  {
    threshold,
    geometry,
    maxAllowedAdjacentGapDiffY = Math.ceil(geometry.timingMarkSize.height / 3),
    rect,
    debug = noDebug(),
  }: {
    threshold: number;
    geometry: BallotCardGeometry;
    maxAllowedAdjacentGapDiffY?: number;
    rect: Rect;
    debug?: Debugger;
  }
): Rect[] {
  const { data, width } = imageData;
  const channels = getImageChannelCount(imageData);

  const markSize = geometry.timingMarkSize;
  const gapSize: Size = {
    width: markSize.width,
    height: markSize.width,
  };
  const timingMarkPeriod = markSize.height + gapSize.height;
  const halfTimingMarkPeriod = Math.round(timingMarkPeriod / 2);
  const halfTimingMarkHeight = Math.round(markSize.height / 2);
  const threeHalvesTimingMarkHeight = Math.round((markSize.height * 3) / 2);
  const offsetStep = width * channels;

  let gapStart = -1;
  type Range = [min: number, max: number];
  const timingMarkGapRangesByX: Array<Range[]> = [];

  for (let x = rect.minX; x <= rect.maxX; x += 1) {
    const xOffset = x * channels;
    const timingMarkGapRanges: Range[] = [];

    for (
      let yLo = rect.minY,
        yMid = halfTimingMarkPeriod,
        yHi = timingMarkPeriod,
        offsetLo = xOffset + yLo * offsetStep,
        offsetMid = xOffset + yMid * offsetStep,
        offsetHi = xOffset + yHi * offsetStep;
      yHi <= rect.maxY;
      yLo += 1,
        yMid += 1,
        yHi += 1,
        offsetLo += offsetStep,
        offsetMid += offsetStep,
        offsetHi += offsetStep
    ) {
      const loLum = data[offsetLo] as number;
      const midLum = data[offsetMid] as number;
      const hiLum = data[offsetHi] as number;

      const loForeground = loLum < threshold;
      const midForeground = midLum < threshold;
      const hiForeground = hiLum < threshold;

      if (loForeground && !midForeground && hiForeground) {
        if (gapStart < 0) {
          gapStart = yLo + markSize.height;
        }
      } else if (gapStart >= 0) {
        const dist = yLo + markSize.height - gapStart + 1;
        // The limiting factor for the distance is the timing mark height,
        // so we compare the distance traveled to the timing mark height.
        if (
          dist >= halfTimingMarkHeight &&
          dist <= threeHalvesTimingMarkHeight
        ) {
          debug.line(x, gapStart, x, yHi - 1 - markSize.height, 'green');
          timingMarkGapRanges.push([gapStart, yHi - 1 - markSize.height]);
        }
        gapStart = -1;
      }
    }

    timingMarkGapRangesByX[x] = timingMarkGapRanges;
  }

  const groupedTimingMarkGapRanges: Array<{
    xStart: number;
    ranges: Range[];
  }> = [];

  for (const [x, timingMarkGapRanges] of timingMarkGapRangesByX.entries()) {
    if (!timingMarkGapRanges) {
      continue;
    }

    for (const [yMin, yMax] of timingMarkGapRanges) {
      let foundGroup = false;

      for (const { xStart, ranges } of groupedTimingMarkGapRanges) {
        if (x !== xStart + ranges.length) {
          continue;
        }

        const lastRange = ranges[ranges.length - 1];
        assert(lastRange);
        const [lastRangeMin, lastRangeMax] = lastRange;
        if (
          lastRangeMin >= yMin - maxAllowedAdjacentGapDiffY &&
          lastRangeMin <= yMin + maxAllowedAdjacentGapDiffY &&
          lastRangeMax <= yMax + maxAllowedAdjacentGapDiffY &&
          lastRangeMax >= yMax - maxAllowedAdjacentGapDiffY
        ) {
          ranges.push([yMin, yMax]);
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        groupedTimingMarkGapRanges.push({
          xStart: x,
          ranges: [[yMin, yMax]],
        });
      }
    }
  }

  const allowedGapWidthError = Math.round(gapSize.width * 0.5);
  const allowedGapHeightError = Math.round(gapSize.height * 0.5);

  return groupedTimingMarkGapRanges.flatMap(({ xStart, ranges }) => {
    const minX = xStart;
    const maxX = xStart + ranges.length;
    const minY = Math.min(...ranges.map(([min]) => min));
    const maxY = Math.max(...ranges.map(([, max]) => max));
    const gapRect = makeRect({ minX, minY, maxX, maxY });

    // Keep anything that is close to the expected size in at least one
    // dimension. This keeps e.g. side timing mark gaps that are narrower than
    // expected due to the scan being cropped.
    if (
      (gapRect.width >= gapSize.width - allowedGapWidthError &&
        gapRect.width <= gapSize.width + allowedGapWidthError) ||
      (gapRect.height >= gapSize.height - allowedGapHeightError &&
        gapRect.height <= gapSize.height + allowedGapHeightError)
    ) {
      return [gapRect];
    }

    return [];
  });
}

/**
 * Scans an image horizontally within a given rectangle for areas that look like
 * gaps between timing marks. Each returned rectangle represents possible
 * whitespace between timing marks. Use this to find the top and bottom timing
 * marks on a ballot card.
 */
function horizontalTimingMarkGapScan(
  imageData: ImageData,
  {
    threshold,
    geometry,
    maxAllowedAdjacentGapDiffX = Math.ceil(geometry.timingMarkSize.width / 3),
    rect,
    debug = noDebug(),
  }: {
    threshold: number;
    geometry: BallotCardGeometry;
    maxAllowedAdjacentGapDiffX?: number;
    rect: Rect;
    debug?: Debugger;
  }
): Rect[] {
  const { data, width } = imageData;
  const channels = getImageChannelCount(imageData);

  const markSize = geometry.timingMarkSize;
  const gapSize: Size = {
    width: markSize.height,
    height: markSize.height,
  };
  const timingMarkPeriod = markSize.width + gapSize.width;
  const halfTimingMarkPeriod = Math.round(timingMarkPeriod / 2);
  const halfTimingMarkGapWidth = Math.round(gapSize.width / 2);
  const threeHalvesTimingMarkGapWidth = Math.round((gapSize.width * 3) / 2);
  const offsetStep = channels;

  let gapStart = -1;
  type Range = [min: number, max: number];
  const timingMarkGapRangesByY: Array<Range[]> = [];

  for (let y = rect.minY; y <= rect.maxY; y += 1) {
    const yOffset = y * width * channels;
    const timingMarkGapRanges: Range[] = [];

    for (
      let xLo = rect.minX,
        xMid = halfTimingMarkPeriod,
        xHi = timingMarkPeriod,
        offsetLo = yOffset + xLo * offsetStep,
        offsetMid = yOffset + xMid * offsetStep,
        offsetHi = yOffset + xHi * offsetStep;
      xHi <= rect.maxX;
      xLo += 1,
        xMid += 1,
        xHi += 1,
        offsetLo += offsetStep,
        offsetMid += offsetStep,
        offsetHi += offsetStep
    ) {
      const loLum = data[offsetLo] as number;
      const midLum = data[offsetMid] as number;
      const hiLum = data[offsetHi] as number;

      const loForeground = loLum < threshold;
      const midForeground = midLum < threshold;
      const hiForeground = hiLum < threshold;

      if (loForeground && !midForeground && hiForeground) {
        if (gapStart < 0) {
          gapStart = xMid;
        }
      } else if (gapStart >= 0) {
        const dist = xMid - gapStart + 1;
        // The limiting factor for the distance is the timing mark gap,
        // so we compare the distance traveled to the timing mark gap.
        if (
          dist >= halfTimingMarkGapWidth &&
          dist <= threeHalvesTimingMarkGapWidth
        ) {
          debug.line(gapStart, y, xMid - 1, y, 'green');
          timingMarkGapRanges.push([gapStart, xMid - 1]);
        }
        gapStart = -1;
      }
    }

    timingMarkGapRangesByY[y] = timingMarkGapRanges;
  }

  const groupedTimingMarkGapRanges: Array<{
    yStart: number;
    ranges: Range[];
  }> = [];

  for (const [y, timingMarkGapRanges] of timingMarkGapRangesByY.entries()) {
    if (!timingMarkGapRanges) {
      continue;
    }

    for (const [xMin, xMax] of timingMarkGapRanges) {
      let foundGroup = false;

      for (const { yStart, ranges } of groupedTimingMarkGapRanges) {
        if (y !== yStart + ranges.length) {
          continue;
        }

        const lastRange = ranges[ranges.length - 1];
        assert(lastRange);
        const [lastRangeMin, lastRangeMax] = lastRange;
        if (
          lastRangeMin >= xMin - maxAllowedAdjacentGapDiffX &&
          lastRangeMin <= xMin + maxAllowedAdjacentGapDiffX &&
          lastRangeMax <= xMax + maxAllowedAdjacentGapDiffX &&
          lastRangeMax >= xMax - maxAllowedAdjacentGapDiffX
        ) {
          ranges.push([xMin, xMax]);
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        groupedTimingMarkGapRanges.push({
          yStart: y,
          ranges: [[xMin, xMax]],
        });
      }
    }
  }

  const allowedGapHeightError = Math.ceil(gapSize.height * 0.5);
  const allowedGapWidthError = Math.ceil(gapSize.width * 0.5);

  return groupedTimingMarkGapRanges.flatMap(({ yStart, ranges }) => {
    const minY = yStart;
    const maxY = yStart + ranges.length;
    const minX = Math.min(...ranges.map(([min]) => min));
    const maxX = Math.max(...ranges.map(([, max]) => max));
    const gapRect = makeRect({ minX, minY, maxX, maxY });

    if (
      gapRect.width >= gapSize.width - allowedGapWidthError &&
      gapRect.width <= gapSize.width + allowedGapWidthError &&
      gapRect.height >= gapSize.height - allowedGapHeightError &&
      gapRect.height <= gapSize.height + allowedGapHeightError
    ) {
      return [gapRect];
    }

    return [];
  });
}

/**
 * Determines rectangles for timing marks based on the rectangles for the gaps
 * between them.
 */
function computeTimingMarksFromGaps(
  gaps: Iterable<Rect>,
  {
    geometry,
    horizontal,
  }: {
    geometry: BallotCardGeometry;
    horizontal: boolean;
  }
): Rect[] {
  const timingMarks: Rect[] = [];

  function addTimingMark(rect: Rect) {
    for (const existing of timingMarks) {
      if (rectsOverlap(existing, rect)) {
        return;
      }
    }

    timingMarks.push(rect);
  }

  for (const gap of gaps) {
    if (horizontal) {
      addTimingMark(
        makeRect({
          minX: gap.minX - geometry.timingMarkSize.width,
          minY: gap.minY,
          maxX: gap.minX - 1,
          maxY: gap.maxY,
        })
      );
      addTimingMark(
        makeRect({
          minX: gap.maxX + 1,
          minY: gap.minY,
          maxX: gap.maxX + geometry.timingMarkSize.width,
          maxY: gap.maxY,
        })
      );
    } else {
      addTimingMark(
        makeRect({
          minX: gap.minX,
          minY: gap.minY - geometry.timingMarkSize.height,
          maxX: gap.maxX,
          maxY: gap.minY - 1,
        })
      );
      addTimingMark(
        makeRect({
          minX: gap.minX,
          minY: gap.maxY + 1,
          maxX: gap.maxX,
          maxY: gap.maxY + geometry.timingMarkSize.height,
        })
      );
    }
  }

  return [...timingMarks].sort((a, b) =>
    horizontal ? a.minX - b.minX : a.minY - b.minY
  );
}

/**
 * Results of finding the timing marks and grid lines on a front ballot card.
 */
interface InterpretFrontBallotCardLayoutResult {
  readonly side: 'front';
  readonly completeTimingMarks: CompleteTimingMarks;
  readonly geometry: BallotCardGeometry;
  readonly grid: PossibleOptionBubblesGrid;
  readonly imageData: ImageData;
  readonly metadata: FrontMarksMetadata;
  readonly orientation: BallotCardOrientation;
  readonly partialTimingMarks: PartialTimingMarks;
}

/**
 * Results of finding the timing marks and grid lines on a back ballot card.
 */
interface InterpretBackBallotCardLayoutResult {
  readonly side: 'back';
  readonly completeTimingMarks: CompleteTimingMarks;
  readonly geometry: BallotCardGeometry;
  readonly grid: PossibleOptionBubblesGrid;
  readonly imageData: ImageData;
  readonly metadata: BackMarksMetadata;
  readonly orientation: BallotCardOrientation;
  readonly partialTimingMarks: PartialTimingMarks;
}

/**
 * Results of finding the timing marks and grid lines on a ballot card.
 */
export type InterpretBallotCardLayoutResult =
  | InterpretFrontBallotCardLayoutResult
  | InterpretBackBallotCardLayoutResult;

/**
 * Assuming `point` is within the bounds of a timing mark, expands out from
 * there until the bounds of the timing mark are reached or the expected size of
 * the timing mark is reached. This helps us refine the exact bounds of the
 * timing mark.
 */
function findTimingMarkContainingPoint(
  imageData: ImageData,
  point: Point,
  geometry: BallotCardGeometry
): Rect | undefined {
  const { data, width, height } = imageData;
  const channels = getImageChannelCount(imageData);
  const threshold = otsu(data, channels);

  const maxWidth = Math.ceil(geometry.timingMarkSize.width);
  const maxHeight = Math.ceil(geometry.timingMarkSize.height);
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  let minX = x;
  let maxX = x;
  let minY = y;
  let maxY = y;

  while (minX >= 0 && maxX < width && maxX - minX + 1 <= maxWidth) {
    let hasExpanded = false;

    if ((data[(y * width + minX) * channels] as number) < threshold) {
      minX -= 1;
      hasExpanded = true;
    }

    if ((data[(y * width + maxX) * channels] as number) < threshold) {
      maxX += 1;
      hasExpanded = true;
    }

    if (!hasExpanded) {
      break;
    }
  }

  while (minY >= 0 && maxY < height && maxY - minY + 1 <= maxHeight) {
    let hasExpanded = false;

    if ((data[(minY * width + x) * channels] as number) < threshold) {
      minY -= 1;
      hasExpanded = true;
    }

    if ((data[(maxY * width + x) * channels] as number) < threshold) {
      maxY += 1;
      hasExpanded = true;
    }

    if (!hasExpanded) {
      break;
    }
  }

  if (minX === maxX || minY === maxY) {
    // No expansion occurred; we're not inside a timing mark.
    return undefined;
  }

  return makeRect({ minX, minY, maxX, maxY });
}

/**
 * Finds the bottom timing marks on a ballot card.
 *
 * @param imageData the image data of the ballot card
 * @param segment a line segment from the center of the bottom left timing mark to the center of the bottom right timing mark
 * @param geometry the geometry of the ballot card
 */
function findBottomTimingMarksAlongSegment(
  imageData: ImageData,
  segment: Segment,
  geometry: BallotCardGeometry
): Rect[] {
  const timingMarks: Rect[] = [];
  const segmentDistance = distance(segment.from, segment.to);
  const distancePerTimingMark = segmentDistance / (geometry.gridSize.width - 1);

  for (let i = 0; i < geometry.gridSize.width; i += 1) {
    const segmentToTimingMark = extendLineSegmentToLength(
      segment,
      distancePerTimingMark * i
    );
    const timingMark = findTimingMarkContainingPoint(
      imageData,
      segmentToTimingMark.to,
      geometry
    );

    if (timingMark) {
      timingMarks.push(timingMark);
    }
  }

  return timingMarks;
}

/**
 * Finds timing marks and extracts ballot card metadata.
 */
export function interpretBallotCardLayout(
  imageData: ImageData,
  {
    geometry,
    debug = noDebug(),
  }: { geometry: BallotCardGeometry; debug?: Debugger }
): InterpretBallotCardLayoutResult {
  const { width, height } = imageData;
  const channels = getImageChannelCount(imageData);
  const inset = getSearchInset(geometry);
  const threshold = otsu(imageData.data, channels);

  /* istanbul ignore next */
  if (debug.isEnabled()) {
    debug.capture('inset', () => {
      const insetColor = '#ff00007f';
      debug.rect(0, 0, width, inset.top, insetColor);
      debug.rect(0, height - inset.bottom, width, inset.bottom, insetColor);
      debug.rect(
        0,
        inset.top,
        inset.left,
        height - inset.top - inset.bottom,
        insetColor
      );
      debug.rect(
        width - inset.right,
        inset.bottom,
        inset.right,
        height - inset.top - inset.bottom,
        insetColor
      );
    });
  }

  /// Find the left and right edges of the ballot card first, then use those
  /// to find the top and bottom edges of the ballot card. The card may be
  /// rotated 180 degrees, so we need to look for both top and bottom edges
  /// even though one of them is likely to be incorrect using this method.

  let leftSideTimingMarkGaps = debug.capture('left side', () =>
    verticalTimingMarkGapScan(imageData, {
      geometry,
      threshold,
      rect: makeRect({
        minX: 0,
        minY: 0,
        maxX: inset.left,
        maxY: height,
      }),
      debug,
    })
  );
  let leftSideBestFitLine = findBestFitLineSegmentThrough({
    rects: leftSideTimingMarkGaps,
    canvasSize: geometry.canvasSize,
    expectedAngle: NINETY_DEGREES,
    angleTolerance: MAX_ROTATION,
    debug,
  });
  assert(leftSideBestFitLine);

  let rightSideTimingMarkGaps = debug.capture('right side', () =>
    verticalTimingMarkGapScan(imageData, {
      geometry,
      threshold,
      rect: makeRect({
        minX: imageData.width - inset.right,
        minY: 0,
        maxX: imageData.width - 1,
        maxY: height,
      }),
      debug,
    })
  );
  let rightSideBestFitLine = findBestFitLineSegmentThrough({
    rects: rightSideTimingMarkGaps,
    canvasSize: geometry.canvasSize,
    expectedAngle: NINETY_DEGREES,
    angleTolerance: MAX_ROTATION,
    debug,
  });
  assert(rightSideBestFitLine);

  /// Now that we have the right and left edges of the ballot card, we look
  /// for the top and bottom while constraining the angle of their lines to be
  /// close to 90° rotated from the left and right.

  const leftSideAngle = normalizeHalfAngle(
    vectorAngle(
      heading(
        leftSideBestFitLine.lineSegment.from,
        leftSideBestFitLine.lineSegment.to
      )
    )
  );
  const rightSideAngle = normalizeHalfAngle(
    vectorAngle(
      heading(
        rightSideBestFitLine.lineSegment.from,
        rightSideBestFitLine.lineSegment.to
      )
    )
  );
  assert(
    checkApproximatelyColinear(
      leftSideAngle,
      rightSideAngle,
      MAX_ROTATION_ERROR
    ),
    `left and right sides are not colinear: ${radiansToDegrees(
      leftSideAngle
    )} vs ${radiansToDegrees(rightSideAngle)}`
  );
  const expectedHorizontalAngle = normalizeHalfAngle(
    (leftSideAngle - NINETY_DEGREES + rightSideAngle - NINETY_DEGREES) / 2
  );

  let topSideTimingMarkGaps = debug.capture('top side', () =>
    horizontalTimingMarkGapScan(imageData, {
      geometry,
      threshold,
      rect: makeRect({
        minX: 0,
        minY: 0,
        maxX: width,
        maxY: inset.top,
      }),
      debug,
    })
  );
  let topSideBestFitLine = findBestFitLineSegmentThrough({
    rects: topSideTimingMarkGaps,
    canvasSize: geometry.canvasSize,
    expectedAngle: expectedHorizontalAngle,
    angleTolerance: MAX_ROTATION_ERROR,
    debug,
  });
  assert(topSideBestFitLine);

  let bottomSideTimingMarkGaps = debug.capture('bottom side', () =>
    horizontalTimingMarkGapScan(imageData, {
      geometry,
      threshold,
      rect: makeRect({
        minX: 0,
        minY: height - inset.bottom,
        maxX: width - 1,
        maxY: height - 1,
      }),
      debug,
    })
  );
  let bottomSideBestFitLine = findBestFitLineSegmentThrough({
    rects: bottomSideTimingMarkGaps,
    canvasSize: geometry.canvasSize,
    expectedAngle: expectedHorizontalAngle,
    angleTolerance: MAX_ROTATION_ERROR,
    debug,
  });
  assert(bottomSideBestFitLine);

  /// The true bottom edge of the ballot card may have very few consecutive
  /// timing marks, so our calculation of the bottom edge may be off. At this
  /// point we don't yet know whether the ballot card is right-side up or not,
  /// so we need to determine which of the top and bottom edges is the true
  /// bottom edge.

  function rotatePoint(point: Point): Point {
    return loc(imageData.width - 1 - point.x, imageData.height - 1 - point.y);
  }

  function rotateRect(rect: Rect): Rect {
    return makeRect({
      minX: imageData.width - 1 - rect.maxX,
      minY: imageData.height - 1 - rect.maxY,
      maxX: imageData.width - 1 - rect.minX,
      maxY: imageData.height - 1 - rect.minY,
    });
  }

  function rotateBestFitLineSegmentResult(
    result: BestFitLineSegmentResult
  ): BestFitLineSegmentResult {
    return {
      rects: result.rects.map(rotateRect),
      lineSegment: {
        from: rotatePoint(result.lineSegment.from),
        to: rotatePoint(result.lineSegment.to),
      },
    };
  }

  /// If we conclude the ballot card is upside down, then rather than trying
  /// to account for that through the rest of the algorithm, we just flip
  /// everything around including the ballot image.

  const orientation =
    topSideBestFitLine.rects.length >= bottomSideBestFitLine.rects.length
      ? BallotCardOrientation.Portrait
      : BallotCardOrientation.PortraitReversed;
  if (orientation === BallotCardOrientation.PortraitReversed) {
    [
      leftSideBestFitLine,
      leftSideTimingMarkGaps,
      rightSideBestFitLine,
      rightSideTimingMarkGaps,
      topSideBestFitLine,
      topSideTimingMarkGaps,
      bottomSideBestFitLine,
      bottomSideTimingMarkGaps,
    ] = [
      rotateBestFitLineSegmentResult(rightSideBestFitLine),
      rightSideTimingMarkGaps.map(rotateRect),
      rotateBestFitLineSegmentResult(leftSideBestFitLine),
      rightSideTimingMarkGaps.map(rotateRect),
      rotateBestFitLineSegmentResult(bottomSideBestFitLine),
      rightSideTimingMarkGaps.map(rotateRect),
      rotateBestFitLineSegmentResult(topSideBestFitLine),
      rightSideTimingMarkGaps.map(rotateRect),
    ];

    rotate180(imageData);
    debug.imageData(0, 0, imageData);
  }

  const intersectionOfTopAndLeftLines = intersectionOfLineSegments(
    leftSideBestFitLine.lineSegment,
    topSideBestFitLine.lineSegment,
    { bounded: false }
  );
  assert(intersectionOfTopAndLeftLines);
  const intersectionOfTopAndRightLines = intersectionOfLineSegments(
    rightSideBestFitLine.lineSegment,
    topSideBestFitLine.lineSegment,
    { bounded: false }
  );
  assert(intersectionOfTopAndRightLines);

  /* istanbul ignore next */
  if (debug.isEnabled()) {
    debug.capture('best fit border', () => {
      assert(
        leftSideBestFitLine &&
          rightSideBestFitLine &&
          topSideBestFitLine &&
          bottomSideBestFitLine
      );
      for (const { lineSegment } of [
        topSideBestFitLine,
        bottomSideBestFitLine,
        leftSideBestFitLine,
        rightSideBestFitLine,
      ]) {
        debug.line(
          lineSegment.from.x,
          lineSegment.from.y,
          lineSegment.to.x,
          lineSegment.to.y,
          '#ff0000'
        );
      }

      const cornerColor = '#00ff00';
      for (const corner of [
        intersectionOfTopAndLeftLines,
        intersectionOfTopAndRightLines,
      ]) {
        const x = Math.round(corner.x);
        const y = Math.round(corner.y);
        for (let level = 0; level < 5; level += 2) {
          const minX = x - level;
          const maxX = x + level;
          const minY = y - level;
          const maxY = y + level;

          for (let px = minX; px <= maxX; px += 1) {
            debug.pixel(px, minY, cornerColor);
            debug.pixel(px, maxY, cornerColor);
          }

          for (let py = minY; py <= maxY; py += 1) {
            debug.pixel(minX, py, cornerColor);
            debug.pixel(maxX, py, cornerColor);
          }
        }
      }
    });
  }

  /// Figure out the timing marks from the timing mark gaps. We filter the
  /// gaps to only include those that are on the correct side of the
  /// left/right/top lines. This can happen if, for example, the left/right
  /// edges of the ballot card show the edge of the paper and the dark border
  /// that results. Without this filtering we might end up with a timing mark
  /// that is on the wrong side of the left/right/top lines.

  const topSideTimingMarks = computeTimingMarksFromGaps(
    topSideBestFitLine.rects.filter(
      (gap) =>
        gap.maxX > intersectionOfTopAndLeftLines.x &&
        gap.minX < intersectionOfTopAndRightLines.x
    ),
    { geometry, horizontal: true }
  );

  const leftSideTimingMarks = computeTimingMarksFromGaps(
    leftSideBestFitLine.rects.filter(
      (gap) => gap.maxY > intersectionOfTopAndLeftLines.y
    ),
    { geometry, horizontal: false }
  );

  const rightSideTimingMarks = computeTimingMarksFromGaps(
    rightSideBestFitLine.rects.filter(
      (gap) => gap.maxY > intersectionOfTopAndRightLines.y
    ),
    { geometry, horizontal: false }
  );

  /// Find the corner timing marks. This is needed to establish the grid and
  /// determine the timing marks in the bottom row/border. It's possible that
  /// the sides and the top will not agree on the corner timing marks. We have
  /// to reconcile them, basing our decision on the assumption that the true
  /// corner timing marks will contain the intersection of the side/top best fit
  /// lines.

  const leftMostTopTimingMark = topSideTimingMarks.reduce((best, mark) =>
    best.minX < mark.minX ? best : mark
  );
  const rightMostTopTimingMark = topSideTimingMarks.reduce((best, mark) =>
    best.maxX > mark.maxX ? best : mark
  );
  const topMostLeftTimingMark = leftSideTimingMarks.reduce((best, mark) =>
    best.minY < mark.minY ? best : mark
  );
  const topMostRightTimingMark = rightSideTimingMarks.reduce((best, mark) =>
    best.minY < mark.minY ? best : mark
  );

  const topLeftTimingMark = rectContainsPoint(
    topMostLeftTimingMark,
    intersectionOfTopAndLeftLines
  )
    ? topMostLeftTimingMark
    : rectContainsPoint(leftMostTopTimingMark, intersectionOfTopAndLeftLines)
    ? leftMostTopTimingMark
    : findTimingMarkContainingPoint(
        imageData,
        intersectionOfTopAndLeftLines,
        geometry
      );
  assert(topLeftTimingMark);

  if (
    topLeftTimingMark !== leftMostTopTimingMark &&
    !rectContainsPoint(leftMostTopTimingMark, intersectionOfTopAndLeftLines)
  ) {
    topSideTimingMarks.unshift(topLeftTimingMark);
  }

  if (
    topLeftTimingMark !== topMostLeftTimingMark &&
    !rectContainsPoint(topMostLeftTimingMark, intersectionOfTopAndLeftLines)
  ) {
    leftSideTimingMarks.unshift(topLeftTimingMark);
  }

  const topRightTimingMark = rectContainsPoint(
    topMostRightTimingMark,
    intersectionOfTopAndRightLines
  )
    ? topMostRightTimingMark
    : rectContainsPoint(rightMostTopTimingMark, intersectionOfTopAndRightLines)
    ? rightMostTopTimingMark
    : findTimingMarkContainingPoint(
        imageData,
        intersectionOfTopAndRightLines,
        geometry
      );
  assert(topRightTimingMark);

  if (
    topRightTimingMark !== rightMostTopTimingMark &&
    !rectContainsPoint(rightMostTopTimingMark, intersectionOfTopAndRightLines)
  ) {
    topSideTimingMarks.push(topRightTimingMark);
  }

  if (
    topRightTimingMark !== topMostRightTimingMark &&
    !rectContainsPoint(topMostRightTimingMark, intersectionOfTopAndRightLines)
  ) {
    rightSideTimingMarks.unshift(topRightTimingMark);
  }

  const bottomLeftTimingMark = leftSideTimingMarks.reduce((best, mark) =>
    best.maxY > mark.maxY ? best : mark
  );
  const bottomRightTimingMark = rightSideTimingMarks.reduce((best, mark) =>
    best.maxY > mark.maxY ? best : mark
  );

  const bottomSideTimingMarks = findBottomTimingMarksAlongSegment(
    imageData,
    {
      from: centerOfRect(bottomLeftTimingMark),
      to: centerOfRect(bottomRightTimingMark),
    },
    geometry
  );

  const partialTimingMarks: PartialTimingMarks = {
    topLeft: topLeftTimingMark,
    topRight: topRightTimingMark,
    bottomLeft: bottomLeftTimingMark,
    bottomRight: bottomRightTimingMark,
    left: leftSideTimingMarks,
    right: rightSideTimingMarks,
    top: topSideTimingMarks,
    bottom: bottomSideTimingMarks,
  };

  debug.capture('partial timing marks', () => {
    renderTimingMarks(debug, partialTimingMarks);
  });

  const completeTimingMarks = interpolateMissingTimingMarks(
    imageData,
    partialTimingMarks,
    { debug }
  );

  debug.capture('complete timing marks', () => {
    renderTimingMarks(debug, completeTimingMarks);
  });

  /// Decode the metadata from the bottom row of timing marks.

  const bits = decodeBottomRowTimingMarks(partialTimingMarks);
  assert(bits);

  const metadataResult = decodeTimingMarkBits(bits);
  assert(
    metadataResult.isOk(),
    `Failed to decode timing mark bits (${bits.length}): ${bits.join(
      ''
    )}\n\nerror: ${JSON.stringify(metadataResult.err(), undefined, 2)}`
  );

  const metadata = metadataResult.ok();

  /// Compute the grid from the complete set of timing marks. This grid has
  /// the center of each timing mark and every possible oval location in the
  /// ballot card.

  const grid = computeTimingMarkGrid(completeTimingMarks, { debug });

  return metadata.side === 'front'
    ? {
        side: metadata.side,
        completeTimingMarks,
        geometry,
        grid,
        imageData,
        metadata,
        orientation,
        partialTimingMarks,
      }
    : {
        side: metadata.side,
        completeTimingMarks,
        geometry,
        grid,
        imageData,
        metadata,
        orientation,
        partialTimingMarks,
      };
}
