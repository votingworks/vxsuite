import { BallotPaperSize, Election } from '@votingworks/types';

export function getBallotLayoutPageSize(election: Election): BallotPaperSize {
  return election.ballotLayout?.paperSize || BallotPaperSize.Letter;
}

export function getBallotLayoutPageSizeReadableString(
  election: Election,
  options: { capitalize?: boolean } = {}
): string {
  const ballotPaperSizeToReadableStringMapping: Record<
    BallotPaperSize,
    string
  > = {
    [BallotPaperSize.Letter]: 'letter',
    [BallotPaperSize.Legal]: 'legal',
    [BallotPaperSize.Custom8Point5X17]: 'custom 8.5x17',
  };
  const readableString =
    ballotPaperSizeToReadableStringMapping[getBallotLayoutPageSize(election)];
  if (options.capitalize) {
    return readableString.charAt(0).toUpperCase() + readableString.slice(1);
  }
  return readableString;
}
