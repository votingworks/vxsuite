import { ballotPaperDimensions, HmpbBallotPaperSize } from '@votingworks/types';

export interface AllBubbleBallotConfig {
  ballotPaperSize: HmpbBallotPaperSize;
  pageDimensions: { width: number; height: number };
  columnsPerInch: number;
  rowsPerInch: number;
  gridRows: number[];
  gridColumns: number[];
  seats: number[];
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
    gridRows: [40, 40, 7, 6, ...Array.from<number>({ length: 21 }).fill(2)], // ballotPaperDimensions(paperSize).height * rowsPerInch - 3,
    gridColumns: [1, 1, 1, 1, ...Array.from<number>({ length: 21 }).fill(1)], // ballotPaperDimensions(paperSize).width * columnsPerInch,
    seats: [25, 25, 2, 2, ...Array.from<number>({ length: 21 }).fill(1)],
    footerRowHeight: 0,
    numPages: 25,
  };
}
