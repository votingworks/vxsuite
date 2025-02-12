import { ballotPaperDimensions, HmpbBallotPaperSize } from '@votingworks/types';

export interface AllBubbleBallotConfig {
  ballotPaperSize: HmpbBallotPaperSize;
  pageDimensions: { width: number; height: number };
  columnsPerInch: number;
  rowsPerInch: number;
  gridRows: number;
  gridColumns: number;
  footerRowHeight: number;
  numPages: number;
}

/**
 * Corresponds to the NH Accuvote ballot grid, which we mimic so that our
 * interpreter can support both Accuvote-style ballots and our ballots.
 * This formula is replicated in libs/ballot-interpreter/src/ballot_card.rs.
 */
export function allBubbleBallotConfig(
  paperSize: HmpbBallotPaperSize
): AllBubbleBallotConfig {
  const columnsPerInch = 4;
  const rowsPerInch = 4;
  return {
    ballotPaperSize: paperSize,
    pageDimensions: ballotPaperDimensions(paperSize),
    columnsPerInch,
    rowsPerInch,
    gridRows: ballotPaperDimensions(paperSize).height * rowsPerInch - 3,
    gridColumns: ballotPaperDimensions(paperSize).width * columnsPerInch,
    footerRowHeight: 2,
    numPages: 2,
  };
}
