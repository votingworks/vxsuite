import { ballotPaperDimensions, HmpbBallotPaperSize } from '@votingworks/types';

export const ballotPaperSize = HmpbBallotPaperSize.Letter;
export const pageDimensions = ballotPaperDimensions(ballotPaperSize);
// Corresponds to the NH Accuvote ballot grid, which we mimic so that our
// interpreter can support both Accuvote-style ballots and our ballots.
// This formula is replicated in libs/ballot-interpreter/src/ballot_card.rs.
export const columnsPerInch = 4;
export const rowsPerInch = 4;
export const gridRows = pageDimensions.height * rowsPerInch - 3;
export const gridColumns = pageDimensions.width * columnsPerInch;
export const footerRowHeight = 2;
export const numPages = 2;
