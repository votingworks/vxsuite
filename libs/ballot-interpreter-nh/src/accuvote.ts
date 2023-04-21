import { BallotPaperSize } from '@votingworks/types';
import { BallotCardGeometry, Size } from './types';
import { makeRect } from './utils';

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
