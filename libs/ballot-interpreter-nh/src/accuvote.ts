import { Debugger, noDebug } from '@votingworks/image-utils';
import { BallotPaperSize, err, Result, safeParse } from '@votingworks/types';
import { matchTemplate } from './images';
import { computeTimingMarkGrid } from './timing_marks';
import {
  BackMarksMetadata,
  BackMarksMetadataSchema,
  BallotCardGeometry,
  Bit,
  CompleteTimingMarks,
  FrontMarksMetadata,
  FrontMarksMetadataSchema,
  Inset,
  MarksMetadata,
  Rect,
  Size,
  ThirtyTwoBits,
} from './types';
import { bitsToNumber, loc, makeRect } from './utils';

const HorizontalTimingMarksCount = 34;
const BottomTimingMarkMetadataBitCount = HorizontalTimingMarksCount - 2;

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
  timingMarkSize: { width: 13.5, height: 4.5 },
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
  ovalSize: { width: 40, height: 26 },
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
  ovalSize: { width: 40, height: 26 },
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
export function getSearchInset(geometry: BallotCardGeometry): Inset {
  const timingMarkBufferCount = 3;
  const timingMarkBuffer =
    (geometry.timingMarkSize.width + geometry.timingMarkSize.height) *
    timingMarkBufferCount;

  if (geometry.contentArea.x === 0 && geometry.contentArea.y === 0) {
    const verticalInset = Math.ceil(
      geometry.canvasSize.height -
        (geometry.timingMarkSize.width + geometry.timingMarkSize.height) *
          (geometry.gridSize.height - timingMarkBufferCount)
    );
    const horizontalInset = Math.ceil(
      geometry.canvasSize.width -
        (geometry.timingMarkSize.width + geometry.timingMarkSize.height) *
          (geometry.gridSize.width - timingMarkBufferCount)
    );
    return {
      left: horizontalInset,
      top: verticalInset,
      right: horizontalInset,
      bottom: verticalInset,
    };
  }
  return {
    left: Math.ceil(geometry.contentArea.minX + timingMarkBuffer),
    top: Math.ceil(geometry.contentArea.minY + timingMarkBuffer),
    right: Math.ceil(
      geometry.canvasSize.width - geometry.contentArea.maxX + timingMarkBuffer
    ),
    bottom: Math.ceil(
      geometry.canvasSize.height - geometry.contentArea.maxY + timingMarkBuffer
    ),
  };
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
    debug = noDebug(),
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
  debug.imageData(0, 0, imageData);

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

  /* istanbul ignore next */
  if (debug.isEnabled()) {
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

  return candidates.filter((oval) => oval.score >= matchThreshold);
}

/**
 * Bit offset for `mod4CheckSum`.
 */
export const FrontMarksMod4CheckSumStart = 0;

/**
 * Exclusive end offset for `mod4CheckSum`.
 */
export const FrontMarksMod4CheckSumEnd = 2;

/**
 * Bit offset for `batchOrPrecinctNumber`.
 */
export const FrontMarksBatchOrPrecinctNumberStart = 2;

/**
 * Exclusive end offset for `batchOrPrecinctNumber`.
 */
export const FrontMarksBatchOrPrecinctNumberEnd = 15;

/**
 * Bit offset for `cardNumber`.
 */
export const FrontMarksCardNumberStart = 15;

/**
 * Exclusive end offset for `cardNumber`.
 */
export const FrontMarksCardNumberEnd = 28;

/**
 * Bit offset for `sequenceNumber`.
 */
export const FrontMarksSequenceNumberStart = 28;

/**
 * Exclusive end offset for `sequenceNumber`.
 */
export const FrontMarksSequenceNumberEnd = 31;

/**
 * Bit offset for `startBit`.
 */
export const FrontMarksStartBitStart = 31;

/**
 * Exclusive end offset for `startBit`.
 */
export const FrontMarksStartBitEnd = 32;

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
      (sum, bit, index) =>
        index >= FrontMarksMod4CheckSumEnd ? sum + bit : sum,
      0
    ) % 4;

  const mod4CheckSum = bitsToNumber(
    bitsRightToLeft,
    FrontMarksMod4CheckSumStart,
    FrontMarksMod4CheckSumEnd
  );
  const batchOrPrecinctNumber = bitsToNumber(
    bitsRightToLeft,
    FrontMarksBatchOrPrecinctNumberStart,
    FrontMarksBatchOrPrecinctNumberEnd
  );
  const cardNumber = bitsToNumber(
    bitsRightToLeft,
    FrontMarksCardNumberStart,
    FrontMarksCardNumberEnd
  );
  const sequenceNumber = bitsToNumber(
    bitsRightToLeft,
    FrontMarksSequenceNumberStart,
    FrontMarksSequenceNumberEnd
  );
  const startBit = bitsToNumber(
    bitsRightToLeft,
    FrontMarksStartBitStart,
    FrontMarksStartBitEnd
  ) as Bit;

  return {
    side: 'front',
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
 * Bit offset for `electionDay`.
 */
export const BackMarksElectionDayStart = 0;

/**
 * Exclusive end offset for `electionDay`.
 */
export const BackMarksElectionDayEnd = 5;

/**
 * Bit offset for `electionMonth`.
 */
export const BackMarksElectionMonthStart = 5;

/**
 * Exclusive end offset for `electionMonth`.
 */
export const BackMarksElectionMonthEnd = 9;

/**
 * Bit offset for `electionYear`.
 */
export const BackMarksElectionYearStart = 9;

/**
 * Exclusive end offset for `electionYear`.
 */
export const BackMarksElectionYearEnd = 16;

/**
 * Bit offset for `electionType`.
 */
export const BackMarksElectionTypeStart = 16;

/**
 * Exclusive end offset for `electionType`.
 */
export const BackMarksElectionTypeEnd = 21;

/**
 * Bit offset for `enderCode`.
 */
export const BackMarksEnderCodeStart = 21;

/**
 * Exclusive end offset for `enderCode`.
 */
export const BackMarksEnderCodeEnd = 32;

/**
 * Expected ender code for the back page.
 */
export const BackExpectedEnderCode: BackMarksMetadata['enderCode'] = [
  0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0,
];

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

  const electionDay = bitsToNumber(
    bitsRightToLeft,
    BackMarksElectionDayStart,
    BackMarksElectionDayEnd
  );

  const electionMonth = bitsToNumber(
    bitsRightToLeft,
    BackMarksElectionMonthStart,
    BackMarksElectionMonthEnd
  );

  const electionYear = bitsToNumber(
    bitsRightToLeft,
    BackMarksElectionYearStart,
    BackMarksElectionYearEnd
  );

  const electionTypeOffset = bitsToNumber(
    bitsRightToLeft,
    BackMarksElectionTypeStart,
    BackMarksElectionTypeEnd
  );

  const enderCode = bitsRightToLeft.slice(
    BackMarksEnderCodeStart,
    BackMarksEnderCodeEnd
  ) as BackMarksMetadata['enderCode'];

  return {
    side: 'back',
    bits: bitsRightToLeft as ThirtyTwoBits,
    electionDay,
    electionMonth,
    electionYear,
    electionType: String.fromCharCode(
      'A'.charCodeAt(0) + electionTypeOffset
    ) as BackMarksMetadata['electionType'],
    enderCode,
    expectedEnderCode: BackExpectedEnderCode,
  };
}

/**
 * Decodes front or back page metadata from a border pattern.
 */
export function decodeTimingMarkBits(
  bits: readonly Bit[]
): Result<MarksMetadata, Error> {
  let lastParseResult: Result<MarksMetadata, Error> | undefined;

  for (const data of [bits, [...bits].reverse()]) {
    const frontParseResult = safeParse(
      FrontMarksMetadataSchema,
      decodeFrontTimingMarkBits(data)
    );
    if (frontParseResult.isOk()) {
      return frontParseResult;
    }
    lastParseResult = frontParseResult;

    const backParseResult = safeParse(
      BackMarksMetadataSchema,
      decodeBackTimingMarkBits(data)
    );
    if (backParseResult.isOk()) {
      return backParseResult;
    }
    lastParseResult = backParseResult;
  }

  return lastParseResult ?? err(new Error('Could not decode timing mark bits'));
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
