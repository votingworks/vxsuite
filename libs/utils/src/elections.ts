import { Election } from '@votingworks/types';

/**
 * Determines if we can distinguish between voting methods for a given election.
 * See https://github.com/votingworks/vxsuite/issues/2631 for added context.
 */
export function canDistinguishVotingMethods(election: Election): boolean {
  return !election.gridLayouts;
}
