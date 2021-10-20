import { BallotPaperSize, Election } from '@votingworks/types';

export function getBallotLayoutPageSize(election: Election): string {
  return (
    election.ballotLayout?.paperSize || BallotPaperSize.Letter
  ).toLowerCase();
}

export default getBallotLayoutPageSize;
