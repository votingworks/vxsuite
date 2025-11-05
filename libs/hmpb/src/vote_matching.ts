import { assert, deepEqual } from '@votingworks/basics';
import { Candidate, GridPositionOption } from '@votingworks/types';

/**
 * Matches a vote to a grid position.
 *
 * For candidate contests with cross-endorsed candidates, this function ensures
 * that the correct bubble is matched based on both candidate ID and party IDs.
 *
 * @param vote - The candidate vote to match
 * @param gridPos - The grid position to check
 * @param allGridPositions - All grid positions for the ballot
 * @returns true if this grid position should be marked for the given vote
 */
export function voteMatchesGridPosition(
  vote: Candidate,
  gridPos: GridPositionOption,
  allGridPositions: readonly GridPositionOption[]
): boolean {
  // Get all grid positions for this contest and candidate ID
  const allCandidateGridPositions = allGridPositions.filter(
    (gp) => gp.type === 'option' && gp.optionId === vote.id
  );
  // If there are not multiple grid positions for this candidate, we can
  // directly match on option ID
  if (allCandidateGridPositions.length < 2) {
    return vote.id === gridPos.optionId;
  }

  // Only in the event of cross-endorsed candidates would we have multiple grid
  // positions for the same candidate ID. In that case, we need to match on
  // party IDs as well. Sort them so that order does not matter.
  const gridPositionWithExpectedParties = allCandidateGridPositions.find((gp) =>
    deepEqual(
      [...(gp.partyIds ?? [])].sort() ?? [],
      [...(vote.partyIds ?? [])].sort()
    )
  );
  assert(gridPositionWithExpectedParties);
  return deepEqual(gridPositionWithExpectedParties, gridPos);
}
