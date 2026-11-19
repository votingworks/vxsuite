import {
  ballotPaperDimensions,
  type HmpbBallotPaperSize,
} from '@votingworks/types';
import { timingMarkCounts } from '../ballot_components.js';

export interface AllBubbleBallotConfig {
  ballotPaperSize: HmpbBallotPaperSize;
  pageDimensions: { width: number; height: number };
  gridRows: number;
  gridColumns: number;
  footerRowHeight: number;
}

/**
 * Corresponds to the NH Accuvote ballot grid, which we mimic so that our
 * interpreter can support both Accuvote-style ballots and our ballots.
 * This formula is replicated in libs/ballot-interpreter/rust/src/ballot_card.rs.
 */
export function allBubbleBallotConfig(
  paperSize: HmpbBallotPaperSize
): AllBubbleBallotConfig {
  const pageDimensions = ballotPaperDimensions(paperSize);
  const gridMarkCounts = timingMarkCounts(pageDimensions);

  return {
    ballotPaperSize: paperSize,
    pageDimensions,
    gridRows: gridMarkCounts.y,
    gridColumns: gridMarkCounts.x,
    footerRowHeight: 2,
  };
}
