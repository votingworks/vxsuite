import { Election } from '@votingworks/types';

export function getBallotLayoutDensity(election: Election): number {
  return election.ballotLayout?.layoutDensity || 0;
}
