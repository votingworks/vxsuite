import { Election } from '@votingworks/types';

export function canViewAndPrintBallots(election: Election): boolean {
  return !election.gridLayouts;
}
