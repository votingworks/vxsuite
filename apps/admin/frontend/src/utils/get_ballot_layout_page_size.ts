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
    [BallotPaperSize.Custom17]: '8.5 x 17',
    [BallotPaperSize.Custom18]: '8.5 x 18',
    [BallotPaperSize.Custom21]: '8.5 x 21',
    [BallotPaperSize.Custom22]: '8.5 x 22',
  };
  const readableString =
    ballotPaperSizeToReadableStringMapping[getBallotLayoutPageSize(election)];
  if (options.capitalize) {
    return readableString.charAt(0).toUpperCase() + readableString.slice(1);
  }
  return readableString;
}
