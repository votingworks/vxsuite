import { Tabulation } from '@votingworks/types';

/**
 * Tests whether CVR votes are empty.
 */
export function isBlankSheet(votes: Tabulation.Votes): boolean {
  return Object.values(votes).every((selections) => selections.length === 0);
}
