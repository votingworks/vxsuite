import { BallotPaperSize } from '@votingworks/types';
import { Debugger } from './debug';
import { getChannels, matchTemplate } from './images';
import { otsu } from './otsu';
import { computeTimingMarkGrid, findBorder } from './timing_marks';
import {
  BackMarksMetadata,
  BallotCardGeometry,
  Bit,
  CompleteTimingMarks,
  FrontMarksMetadata,
  PartialTimingMarks,
  Point,
  Rect,
  Size,
  ThirtyTwoBits,
} from './types';
import {
  bitsToNumber,
  centerOfRect,
  findOverlappingRects,
  loc,
  makeRect,
  median,
} from './utils';

const HorizontalTimingMarksCount = 34;
const BottomTimingMarkMetadataBitCount = HorizontalTimingMarksCount - 2;

const TimingMarkMinSizeRatio: Size = {
  width: 13 / 612,
  height: 4 / 612,
};
const TimingMarkMaxSizeRatio: Size = {
  width: 15 / 612,
  height: 6 / 612,
};
const TimingMarkMinGapSizeRatio: Size = {
  width: 3 / 612,
  height: 12 / 612,
};
const TimingMarkMaxGapSizeRatio: Size = {
  width: 5 / 612,
  height: 14 / 612,
};

function expectedTimingMarkSize(canvasWidth: number): Size {
  const minTimingMarkSize: Size = {
    width: canvasWidth * TimingMarkMinSizeRatio.width,
    height: canvasWidth * TimingMarkMinSizeRatio.height,
  };
  const maxTimingMarkSize: Size = {
    width: canvasWidth * TimingMarkMaxSizeRatio.width,
    height: canvasWidth * TimingMarkMaxSizeRatio.height,
  };

  return {
    width: (minTimingMarkSize.width + maxTimingMarkSize.width) / 2,
    height: (minTimingMarkSize.height + maxTimingMarkSize.height) / 2,
  };
}

function expectedTimingMarkGapSize(canvasWidth: number): Size {
  const minTimingMarkGapSize: Size = {
    width: canvasWidth * TimingMarkMinGapSizeRatio.width,
    height: canvasWidth * TimingMarkMinGapSizeRatio.height,
  };
  const maxTimingMarkGapSize: Size = {
    width: canvasWidth * TimingMarkMaxGapSizeRatio.width,
    height: canvasWidth * TimingMarkMaxGapSizeRatio.height,
  };

  return {
    width: (minTimingMarkGapSize.width + maxTimingMarkGapSize.width) / 2,
    height: (minTimingMarkGapSize.height + maxTimingMarkGapSize.height) / 2,
  };
}

/**
 * Template margins for the front and back of the ballot card in inches.
 */
export const BallotCardTemplateMargins: Size = {
  width: 0.5,
  height: 0.5,
};

/**
 * Ballot geometry information for an 8.5" x 11" template ballot card. Assumes
 * that the ballot card has a border of timing marks on all sides, plus a footer
 * on the bottom of the ballot card front that makes that section unusable for
 * ovals.
 */
export const TemplateBallotCardGeometry8pt5x11: BallotCardGeometry = {
  ballotPaperSize: BallotPaperSize.Letter,
  pixelsPerInch: 72,
  canvasSize: { width: 684, height: 864 },
  contentArea: makeRect({
    minX: 72 * BallotCardTemplateMargins.width, // 0.5" from the left edge
    minY: 72 * BallotCardTemplateMargins.height, // 0.5" from the top edge
    maxX: 684 - 1 - 72 * BallotCardTemplateMargins.width, // 0.5" from the right edge
    maxY: 864 - 1 - 72 * BallotCardTemplateMargins.height, // 0.5" from the bottom edge
  }),
  ovalSize: { width: 15, height: 10 },
  /* Converted from the documented size in inches: 3/16" x 1/16" */
  timingMarkSize: { width: 37.5, height: 12.5 },
  gridSize: { width: 34, height: 41 },
  frontUsableArea: makeRect({
    minX: 0 /* index of left column */ + 1 /* left timing mark column */,
    minY: 0 /* index of top column */ + 1 /* top timing mark row */,
    maxX: 33 /* index of right column */ - 1 /* right timing mark column */,
    maxY:
      40 /* index of bottom row */ - 1 /* timing mark row */ - 2 /* footer */,
  }),
  backUsableArea: makeRect({
    minX: 0 /* index of left column */ + 1 /* left timing mark column */,
    minY: 0 /* index of top column */ + 1 /* top timing mark row */,
    maxX: 33 /* index of right column */ - 1 /* right timing mark column */,
    maxY: 40 /* index of bottom row */ - 1 /* timing mark row */,
  }),
};

/**
 * Ballot geometry information for an 8.5" x 14" template ballot card. Assumes
 * that the ballot card has a border of timing marks on all sides, plus a footer
 * on the bottom of the ballot card front that makes that section unusable for
 * ovals.
 */
export const TemplateBallotCardGeometry8pt5x14: BallotCardGeometry = {
  ballotPaperSize: BallotPaperSize.Letter,
  pixelsPerInch: 72,
  canvasSize: { width: 684, height: 1080 }, // 1" margin results in 9.5" x 15"
  contentArea: makeRect({
    minX: 72 * BallotCardTemplateMargins.width, // 0.5" from the left edge
    minY: 72 * BallotCardTemplateMargins.height, // 0.5" from the top edge
    maxX: 684 - 1 - 72 * BallotCardTemplateMargins.width, // 0.5" from the right edge
    maxY: 864 - 1 - 72 * BallotCardTemplateMargins.height, // 0.5" from the bottom edge
  }),
  ovalSize: { width: 15, height: 10 },
  /* Converted from the documented size in inches: 3/16" x 1/16" */
  timingMarkSize: { width: 13.5, height: 4.5 },
  gridSize: { width: 34, height: 53 },
  frontUsableArea: makeRect({
    minX: 0 /* index of left column */ + 1 /* left timing mark column */,
    minY: 0 /* index of top column */ + 1 /* top timing mark row */,
    maxX: 33 /* index of right column */ - 1 /* right timing mark column */,
    maxY:
      52 /* index of bottom row */ - 1 /* timing mark row */ - 2 /* footer */,
  }),
  backUsableArea: makeRect({
    minX: 0 /* index of left column */ + 1 /* left timing mark column */,
    minY: 0 /* index of top column */ + 1 /* top timing mark row */,
    maxX: 33 /* index of right column */ - 1 /* right timing mark column */,
    maxY: 52 /* index of bottom row */ - 1 /* timing mark row */,
  }),
};

/**
 * Ballot geometry information for an 8.5" x 11" scanned ballot card. Assumes
 * that the ballot card has a border of timing marks on all sides, plus a footer
 * on the bottom of the ballot card front that makes that section unusable for
 * ovals.
 */
export const ScannedBallotCardGeometry8pt5x11: BallotCardGeometry = {
  ballotPaperSize: BallotPaperSize.Letter,
  pixelsPerInch: 200,
  // FIXME: why is 1696 not the same as 8.5 * 200 = 1700?
  canvasSize: { width: 1696, height: 2200 },
  contentArea: makeRect({
    minX: 0,
    minY: 0,
    maxX: 1696 - 1,
    maxY: 2200 - 1,
  }),
  ovalSize: { width: 38, height: 25 },
  /* Converted from the documented size in inches: 3/16" x 1/16" */
  timingMarkSize: { width: 37.5, height: 12.5 },
  gridSize: { width: 34, height: 41 },
  frontUsableArea: makeRect({
    minX: 0 /* index of left column */ + 1 /* left timing mark column */,
    minY: 0 /* index of top column */ + 1 /* top timing mark row */,
    maxX: 33 /* index of right column */ - 1 /* right timing mark column */,
    maxY:
      40 /* index of bottom row */ - 1 /* timing mark row */ - 2 /* footer */,
  }),
  backUsableArea: makeRect({
    minX: 0 /* index of left column */ + 1 /* left timing mark column */,
    minY: 0 /* index of top column */ + 1 /* top timing mark row */,
    maxX: 33 /* index of right column */ - 1 /* right timing mark column */,
    maxY: 40 /* index of bottom row */ - 1 /* timing mark row */,
  }),
};

/**
 * Ballot geometry information for an 8.5" x 14" scanned ballot card. Assumes
 * that the ballot card has a border of timing marks on all sides, plus a footer
 * on the bottom of the ballot card front that makes that section unusable for
 * ovals.
 */
export const ScannedBallotCardGeometry8pt5x14: BallotCardGeometry = {
  ballotPaperSize: BallotPaperSize.Legal,
  pixelsPerInch: 200,
  // FIXME: why is 1696 not the same as 8.5 * 200 = 1700?
  canvasSize: { width: 1696, height: 2800 },
  contentArea: makeRect({
    minX: 0,
    minY: 0,
    maxX: 1696 - 1,
    maxY: 2800 - 1,
  }),
  ovalSize: { width: 38, height: 25 },
  /* Converted from the documented size in inches: 3/16" x 1/16" */
  timingMarkSize: { width: 37.5, height: 12.5 },
  gridSize: { width: 34, height: 53 },
  frontUsableArea: makeRect({
    minX: 0 /* index of left column */ + 1 /* left timing mark column */,
    minY: 0 /* index of top column */ + 1 /* top timing mark row */,
    maxX: 33 /* index of right column */ - 1 /* right timing mark column */,
    maxY:
      52 /* index of bottom row */ - 1 /* timing mark row */ - 2 /* footer */,
  }),
  backUsableArea: makeRect({
    minX: 0 /* index of left column */ + 1 /* left timing mark column */,
    minY: 0 /* index of top column */ + 1 /* top timing mark row */,
    maxX: 33 /* index of right column */ - 1 /* right timing mark column */,
    maxY: 52 /* index of bottom row */ - 1 /* timing mark row */,
  }),
};

/**
 * Gets the amount of pixels to search inward from the edges of an image.
 */
export function getSearchInset(canvasSize: Size): number {
  const { width } = canvasSize;
  const maxTimingMarkSize: Size = {
    width: Math.ceil(width * TimingMarkMaxSizeRatio.width),
    height: Math.ceil(width * TimingMarkMaxSizeRatio.height),
  };
  return Math.ceil(maxTimingMarkSize.width * 5);
}

/**
 * Options for {@link scanForTimingMarksByScoringBlocks}.
 */
export interface ScanForTimingMarksByScoringBlocksOptions {
  readonly debug?: Debugger;
  readonly minimumScore: number;
}

/**
 * Scans an image for timing marks by matching each pixel in a search area
 * against an expected timing mark template.
 */
export function scanForTimingMarksByScoringBlocks(
  imageData: ImageData,
  { debug, minimumScore }: ScanForTimingMarksByScoringBlocksOptions
): Set<Rect> {
  const channels = getChannels(imageData);
  const inset = getSearchInset(imageData);

  /* istanbul ignore next */
  if (debug) {
    debug.layer(scanForTimingMarksByScoringBlocks.name);

    const insetColor = '#ff000033';
    debug
      .layer('inset search area')
      .rect(0, 0, inset, imageData.height, insetColor)
      .rect(imageData.width - inset, 0, inset, imageData.height, insetColor)
      .rect(inset, 0, imageData.width - 2 * inset, inset, insetColor)
      .rect(
        inset,
        imageData.height - inset,
        imageData.width - 2 * inset,
        inset,
        insetColor
      )
      .layerEnd('inset search area');
  }

  const threshold = otsu(imageData.data, channels);
  const { width, height } = imageData;
  const timingMarkSize = expectedTimingMarkSize(width);
  const timingMarkGapSize = expectedTimingMarkGapSize(width);
  let scoredPoints: Array<[number, Point]> = [];

  function matchTimingMarkTemplate(centerX: number, centerY: number): number {
    const expectedTimingMarkMinX = Math.ceil(
      centerX - timingMarkSize.width / 2
    );
    const minX = Math.ceil(
      expectedTimingMarkMinX - timingMarkGapSize.width / 2
    );
    const expectedTimingMarkMaxX = Math.floor(
      centerX + timingMarkSize.width / 2
    );
    const maxX = Math.floor(
      expectedTimingMarkMaxX + timingMarkGapSize.width / 2
    );
    const expectedTimingMarkMinY = Math.ceil(
      centerY - timingMarkSize.height / 2
    );
    const minY = Math.ceil(
      expectedTimingMarkMinY - timingMarkGapSize.width / 2
    );
    const expectedTimingMarkMaxY = Math.floor(
      centerY + timingMarkSize.height / 2
    );
    const maxY = Math.floor(
      expectedTimingMarkMaxY + timingMarkGapSize.width / 2
    );
    const scoreSearchArea = (maxX - minX + 1) * (maxY - minY + 1);

    let matchingPixelCount = 0;
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const lum =
          x < 0 || x >= width || y < 0 || y >= height
            ? 0xff
            : (imageData.data[(y * width + x) * channels] as number);
        const isDark = lum < threshold;
        const expectedDark =
          x >= expectedTimingMarkMinX &&
          x <= expectedTimingMarkMaxX &&
          y >= expectedTimingMarkMinY &&
          y <= expectedTimingMarkMaxY;
        if (isDark === expectedDark) {
          matchingPixelCount += 1;
        }
      }
    }

    return matchingPixelCount / scoreSearchArea;
  }

  debug?.layer('match timing mark template');
  const xStep = Math.max(1, Math.round(timingMarkSize.width / 6));
  const yStep = Math.max(1, Math.round(timingMarkSize.height / 6));
  for (let x = 0; x < width; x += xStep) {
    for (let y = 0; y < height; y += yStep) {
      if (x > inset && x < width - inset && y > inset && y < height - inset) {
        continue;
      }

      const score = matchTimingMarkTemplate(x, y);
      if (score < minimumScore) {
        continue;
      }

      scoredPoints.push([score, loc(x, y)]);
    }
  }
  debug?.layerEnd('match timing mark template');

  // Sort by descending score
  scoredPoints = [...scoredPoints].sort((a, b) => b[0] - a[0]);

  debug?.layer('timing marks by score');
  const timingMarkRects = new Set<Rect>();
  for (const [score, { x, y }] of scoredPoints) {
    const expectedTimingMarkRect = makeRect({
      minX: x - timingMarkSize.width / 2 + 0.5,
      minY: y - timingMarkSize.height / 2 + 0.5,
      maxX: x + timingMarkSize.width / 2 - 0.5,
      maxY: y + timingMarkSize.height / 2 - 0.5,
    });

    let isOverlapping = false;
    for (const rect of timingMarkRects) {
      if (
        x >= rect.minX &&
        y >= rect.minY &&
        x <= rect.maxX &&
        y <= rect.maxY
      ) {
        isOverlapping = true;
        break;
      }
    }

    if (isOverlapping) {
      continue;
    }

    /* istanbul ignore next */
    if (debug) {
      const backgroundColor = `#${Math.round((1 - score) * 0xff)
        .toString(16)
        .padStart(2, '0')}${Math.round(score * 0xff)
        .toString(16)
        .padStart(2, '0')}0077`;
      debug.rect(
        expectedTimingMarkRect.x,
        expectedTimingMarkRect.y,
        expectedTimingMarkRect.width,
        expectedTimingMarkRect.height,
        backgroundColor
      );
    }

    // Expand out from the center to find the actual timing mark.
    const rectCenter = centerOfRect(expectedTimingMarkRect);
    const midX = Math.round(rectCenter.x);
    const midY = Math.round(rectCenter.y);
    let correctedMinX: number;
    let correctedMinY: number;
    let correctedMaxX: number;
    let correctedMaxY: number;

    for (
      correctedMinX = midX;
      correctedMinX >= expectedTimingMarkRect.minX;
      correctedMinX -= 1
    ) {
      const lum = imageData.data[
        (correctedMinX - 1 + midY * width) * channels
      ] as number;
      const isDark = lum < threshold;
      if (!isDark) {
        break;
      }
    }

    for (
      correctedMaxX = midX;
      correctedMaxX <= expectedTimingMarkRect.maxX;
      correctedMaxX += 1
    ) {
      const lum = imageData.data[
        (correctedMaxX + 1 + midY * width) * channels
      ] as number;
      const isDark = lum < threshold;
      if (!isDark) {
        break;
      }
    }

    for (
      correctedMinY = midY;
      correctedMinY >= expectedTimingMarkRect.minY;
      correctedMinY -= 1
    ) {
      const lum = imageData.data[
        (midX + (correctedMinY - 1) * width) * channels
      ] as number;
      const isDark = lum < threshold;
      if (!isDark) {
        break;
      }
    }

    for (
      correctedMaxY = midY;
      correctedMaxY <= expectedTimingMarkRect.maxY;
      correctedMaxY += 1
    ) {
      const lum = imageData.data[
        (midX + (correctedMaxY + 1) * width) * channels
      ] as number;
      const isDark = lum < threshold;
      if (!isDark) {
        break;
      }
    }

    const correctedTimingMarkRect = makeRect({
      minX: correctedMinX,
      minY: correctedMinY,
      maxX: correctedMaxX,
      maxY: correctedMaxY,
    });

    if (
      correctedTimingMarkRect.width > timingMarkSize.width / 2 &&
      correctedTimingMarkRect.height > timingMarkSize.height / 2
    ) {
      timingMarkRects.add(correctedTimingMarkRect);
    }
  }

  // Remove timing marks that overlap with another that is a better match.
  const medianTimingMarkWidth = median(
    [...timingMarkRects].map((rect) => rect.width)
  );
  const medianTimingMarkHeight = median(
    [...timingMarkRects].map((rect) => rect.height)
  );
  const overlappingRects = findOverlappingRects(timingMarkRects);
  for (const [rect, otherRect] of overlappingRects) {
    const rectError =
      Math.abs(rect.width - medianTimingMarkWidth) +
      Math.abs(rect.height - medianTimingMarkHeight);
    const otherRectError =
      Math.abs(otherRect.width - medianTimingMarkWidth) +
      Math.abs(otherRect.height - medianTimingMarkHeight);

    if (rectError < otherRectError) {
      timingMarkRects.delete(otherRect);
    } else {
      timingMarkRects.delete(rect);
    }
  }

  debug
    ?.layerEnd('timing marks by score')
    .layerEnd(scanForTimingMarksByScoringBlocks.name);
  return timingMarkRects;
}

/**
 * Finds the timing marks in a border pattern from a set of timing mark rects.
 */
export function findTimingMarks({
  geometry,
  rects,
  debug,
}: {
  geometry: BallotCardGeometry;
  rects: Iterable<Rect>;
  debug?: Debugger;
}): PartialTimingMarks | undefined {
  const border = findBorder({ geometry, rects, debug });

  if (border && border.top.length < border.bottom.length) {
    return {
      bottom: border.top,
      left: border.right,
      right: border.left,
      top: border.bottom,
      bottomLeft: border.topRight,
      bottomRight: border.topLeft,
      topLeft: border.bottomRight,
      topRight: border.bottomLeft,
    };
  }

  return border;
}

/**
 * Represents an oval found in a ballot template.
 */
export interface TemplateOval {
  readonly row: number;
  readonly column: number;
  readonly rect: Rect;
  readonly score: number;
}

/**
 * This value was experimentally determined to be the minimum score for an
 * oval to be considered a real oval.
 */
const DefaultTemplateOvalMatchScoreThreshold = 0.95;

/**
 * Finds template ovals by looking at the timing mark grid intersection points.
 */
export function findTemplateOvals(
  imageData: ImageData,
  ovalTemplate: ImageData,
  timingMarks: CompleteTimingMarks,
  {
    debug,
    usableArea,
    matchThreshold = DefaultTemplateOvalMatchScoreThreshold,
    matchErrorPixels = 2,
  }: {
    debug?: Debugger;
    usableArea: Rect;
    matchThreshold?: number;
    matchErrorPixels?: number;
  }
): TemplateOval[] {
  debug?.layer(findTemplateOvals.name).imageData(0, 0, imageData);

  const grid = computeTimingMarkGrid(timingMarks);
  const candidates: TemplateOval[] = [];

  for (const [r, row] of grid.rows.entries()) {
    if (r < usableArea.minY || r > usableArea.maxY) {
      continue;
    }

    for (const [c, point] of row.entries()) {
      if (c < usableArea.minX || c > usableArea.maxX) {
        continue;
      }

      const ovalOrigin = loc(
        Math.floor(point.x - ovalTemplate.width / 2),
        Math.floor(point.y - ovalTemplate.height / 2)
      );
      let bestScore: number | undefined;
      let bestRect: Rect | undefined;
      for (
        let x = ovalOrigin.x - matchErrorPixels;
        x < ovalOrigin.x + matchErrorPixels;
        x += 1
      ) {
        for (
          let y = ovalOrigin.y - matchErrorPixels;
          y < ovalOrigin.y + matchErrorPixels;
          y += 1
        ) {
          const score = matchTemplate(
            imageData,
            ovalTemplate,
            loc(x, y),
            matchThreshold
          );
          if (!bestScore || score > bestScore) {
            bestScore = score;
            bestRect = makeRect({
              minX: x,
              minY: y,
              maxX: x + ovalTemplate.width - 1,
              maxY: y + ovalTemplate.height - 1,
            });
          }
        }
      }
      if (bestScore && bestRect) {
        candidates.push({
          row: r,
          column: c,
          score: bestScore,
          rect: bestRect,
        });
      }
    }
  }

  if (debug) {
    for (const candidate of candidates) {
      const matches = candidate.score >= matchThreshold;
      debug.rect(
        candidate.rect.minX,
        candidate.rect.minY,
        candidate.rect.width,
        candidate.rect.height,
        matches
          ? `#00${Math.round(candidate.score * 255)
              .toString(16)
              .padStart(2, '0')}0066`
          : `#${Math.round((1 - candidate.score) * 255)
              .toString(16)
              .padStart(2, '0')}000066`
      );
    }
  }

  debug?.layerEnd(findTemplateOvals.name);
  return candidates.filter((oval) => oval.score >= matchThreshold);
}

/**
 * Decodes the front page metadata from a border pattern.
 *
 * @param bits The bits from the timing marks on the front page in LSB to MSB
 *             order (i.e. right-to-left).
 */
export function decodeFrontTimingMarkBits(
  bits: readonly Bit[]
): FrontMarksMetadata | undefined {
  if (bits.length !== BottomTimingMarkMetadataBitCount) {
    return;
  }

  const bitsRightToLeft = bits as unknown as ThirtyTwoBits;
  const computedMod4CheckSum =
    bitsRightToLeft.reduce<number>(
      (sum, bit, index) => (index >= 2 ? sum + bit : sum),
      0
    ) % 4;

  const mod4CheckSum = bitsToNumber(bitsRightToLeft, 0, 2);
  const batchOrPrecinctNumber = bitsToNumber(bitsRightToLeft, 2, 15);
  const cardNumber = bitsToNumber(bitsRightToLeft, 15, 28);
  const sequenceNumber = bitsToNumber(bitsRightToLeft, 28, 31);
  const startBit = bitsRightToLeft[31];

  return {
    bits: bitsRightToLeft,
    mod4CheckSum,
    computedMod4CheckSum,
    batchOrPrecinctNumber,
    cardNumber,
    sequenceNumber,
    startBit,
  };
}

/**
 * Decodes the back page metadata from a border pattern.
 *
 * @param bits The bits from the timing marks on the front page in LSB to MSB
 *             order (i.e. right-to-left).
 */
export function decodeBackTimingMarkBits(
  bits: readonly Bit[]
): BackMarksMetadata | undefined {
  if (bits.length !== BottomTimingMarkMetadataBitCount) {
    return;
  }

  const bitsRightToLeft = bits as unknown as ThirtyTwoBits;

  const electionDay =
    bitsRightToLeft[0] * (1 << 0) +
    bitsRightToLeft[1] * (1 << 1) +
    bitsRightToLeft[2] * (1 << 2) +
    bitsRightToLeft[3] * (1 << 3) +
    bitsRightToLeft[4] * (1 << 4);

  const electionMonth =
    bitsRightToLeft[5] * (1 << 0) +
    bitsRightToLeft[6] * (1 << 1) +
    bitsRightToLeft[7] * (1 << 2) +
    bitsRightToLeft[8] * (1 << 3);

  const electionYear =
    bitsRightToLeft[9] * (1 << 0) +
    bitsRightToLeft[10] * (1 << 1) +
    bitsRightToLeft[11] * (1 << 2) +
    bitsRightToLeft[12] * (1 << 3) +
    bitsRightToLeft[13] * (1 << 4) +
    bitsRightToLeft[14] * (1 << 5) +
    bitsRightToLeft[15] * (1 << 6);

  const electionTypeOffset =
    bitsRightToLeft[16] * (1 << 0) +
    bitsRightToLeft[17] * (1 << 1) +
    bitsRightToLeft[18] * (1 << 2) +
    bitsRightToLeft[19] * (1 << 3) +
    bitsRightToLeft[20] * (1 << 4);

  const enderCode: BackMarksMetadata['enderCode'] = [
    bitsRightToLeft[21],
    bitsRightToLeft[22],
    bitsRightToLeft[23],
    bitsRightToLeft[24],
    bitsRightToLeft[25],
    bitsRightToLeft[26],
    bitsRightToLeft[27],
    bitsRightToLeft[28],
    bitsRightToLeft[29],
    bitsRightToLeft[30],
    bitsRightToLeft[31],
  ];

  return {
    bits: bitsRightToLeft as ThirtyTwoBits,
    electionDay,
    electionMonth,
    electionYear,
    electionType: String.fromCharCode(
      'A'.charCodeAt(0) + electionTypeOffset
    ) as BackMarksMetadata['electionType'],
    enderCode,
    expectedEnderCode: [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
  };
}

/**
 * Get scanned ballot card geometry for an election.
 */
export function getScannedBallotCardGeometry(
  paperSize: BallotPaperSize
): BallotCardGeometry {
  switch (paperSize) {
    case BallotPaperSize.Letter:
      return ScannedBallotCardGeometry8pt5x11;
    case BallotPaperSize.Legal:
      return ScannedBallotCardGeometry8pt5x14;
    default:
      throw new Error(`unexpected ballot size: ${paperSize}`);
  }
}

/**
 * Get template ballot card geometry for an election.
 */
export function getTemplateBallotCardGeometry(
  paperSize: BallotPaperSize
): BallotCardGeometry {
  switch (paperSize) {
    case BallotPaperSize.Letter:
      return TemplateBallotCardGeometry8pt5x11;
    case BallotPaperSize.Legal:
      return TemplateBallotCardGeometry8pt5x14;
    default:
      throw new Error(`unexpected ballot size: ${paperSize}`);
  }
}

/**
 * Determine the ballot paper size from the template canvas size.
 */
export function getTemplateBallotPaperSize(
  canvasSize: Size
): BallotPaperSize | undefined {
  if (
    canvasSize.width === TemplateBallotCardGeometry8pt5x11.canvasSize.width &&
    canvasSize.height === TemplateBallotCardGeometry8pt5x11.canvasSize.height
  ) {
    return BallotPaperSize.Letter;
  }

  if (
    canvasSize.width === TemplateBallotCardGeometry8pt5x14.canvasSize.width &&
    canvasSize.height === TemplateBallotCardGeometry8pt5x14.canvasSize.height
  ) {
    return BallotPaperSize.Legal;
  }

  return undefined;
}
