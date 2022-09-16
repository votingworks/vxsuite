import { Election } from '@votingworks/types';

export function canViewAndPrintBallotsWithConverter(
  election: Election
): boolean {
  return !election.gridLayouts;
}
