import { Debugger } from './debug';
import { otsu } from './otsu';
import { findBorder } from './timing_marks';
import {
  BackMarksMetadata,
  Bit,
  FrontMarksMetadata,
  PartialTimingMarks,
  Point,
  Rect,
  Size,
  ThirtyTwoBits,
} from './types';
import {
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
  const channels = imageData.data.length / (imageData.width * imageData.height);
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

  const threshold = otsu(imageData.data);
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

        /* istanbul ignore next */
        if (debug) {
          if (centerX % 25 === 10 && centerY % 25 === 10) {
            debug.rect(
              x,
              y,
              1,
              1,
              isDark !== expectedDark ? '#ff000077' : '#00ff0077'
            );
          }
        }
      }
    }

    return matchingPixelCount / scoreSearchArea;
  }

  debug?.layer('match timing mark template');
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
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
      const lum = imageData.data[correctedMinX - 1 + midY * width] as number;
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
      const lum = imageData.data[correctedMaxX + 1 + midY * width] as number;
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
      const lum = imageData.data[midX + (correctedMinY - 1) * width] as number;
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
      const lum = imageData.data[midX + (correctedMaxY + 1) * width] as number;
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

    timingMarkRects.add(correctedTimingMarkRect);
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
  canvasSize,
  rects,
  debug,
}: {
  canvasSize: Size;
  rects: Iterable<Rect>;
  debug?: Debugger;
}): PartialTimingMarks | undefined {
  const border = findBorder({ canvasSize, rects, debug });

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
    bitsRightToLeft.slice(2).reduce<number>((sum, bit) => sum + bit, 0) % 4;

  const mod4CheckSum =
    bitsRightToLeft[0] * (1 << 0) + bitsRightToLeft[1] * (1 << 1);

  const batchOrPrecinctNumber =
    bitsRightToLeft[2] * (1 << 0) +
    bitsRightToLeft[3] * (1 << 1) +
    bitsRightToLeft[4] * (1 << 2) +
    bitsRightToLeft[5] * (1 << 3) +
    bitsRightToLeft[6] * (1 << 4) +
    bitsRightToLeft[7] * (1 << 5) +
    bitsRightToLeft[8] * (1 << 6) +
    bitsRightToLeft[9] * (1 << 7) +
    bitsRightToLeft[10] * (1 << 8) +
    bitsRightToLeft[11] * (1 << 9) +
    bitsRightToLeft[12] * (1 << 10) +
    bitsRightToLeft[13] * (1 << 11) +
    bitsRightToLeft[14] * (1 << 12);

  const cardNumber =
    bitsRightToLeft[15] * (1 << 0) +
    bitsRightToLeft[16] * (1 << 1) +
    bitsRightToLeft[17] * (1 << 2) +
    bitsRightToLeft[18] * (1 << 3) +
    bitsRightToLeft[19] * (1 << 4) +
    bitsRightToLeft[20] * (1 << 5) +
    bitsRightToLeft[21] * (1 << 6) +
    bitsRightToLeft[22] * (1 << 7) +
    bitsRightToLeft[23] * (1 << 8) +
    bitsRightToLeft[24] * (1 << 9) +
    bitsRightToLeft[25] * (1 << 10) +
    bitsRightToLeft[26] * (1 << 11) +
    bitsRightToLeft[27] * (1 << 12);

  const sequenceNumber =
    bitsRightToLeft[28] * (1 << 0) +
    bitsRightToLeft[29] * (1 << 1) +
    bitsRightToLeft[30] * (1 << 2);

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
