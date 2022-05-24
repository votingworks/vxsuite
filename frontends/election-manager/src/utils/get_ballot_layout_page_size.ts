import { BallotPaperSize, Election } from '@votingworks/types';

export function getBallotLayoutPageSize(election: Election): BallotPaperSize {
  return election.ballotLayout?.paperSize || BallotPaperSize.Letter;
}

export function getBallotLayoutPageSizeStr(election: Election): string {
  return getBallotLayoutPageSize(election).toLowerCase();
}
