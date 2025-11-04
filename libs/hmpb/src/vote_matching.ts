import { assert, deepEqual } from '@votingworks/basics';
import { Candidate, GridPositionOption } from '@votingworks/types';

/**
 * Matches a vote to a grid position.
 *
 * For candidate contests with cross-endorsed candidates, the order of grid
 * positions maps to the order of OrderedCandidateOptions in the ballot style.
 * This allows us to correctly identify which specific bubble (with which party
 * affiliation) should be marked for a given vote.
 *
 * @param vote - The candidate vote to match
 * @param gridPos - The grid position to check
 * @param contest - The candidate contest
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
    (gp) => gp.optionId === vote.id
  );
  if (allCandidateGridPositions.length === 0) {
    return false;
  }
  if (allCandidateGridPositions.length === 1) {
    return deepEqual(gridPos, allCandidateGridPositions[0]);
  }

  // Only in the event of cross-endorsed candidates would we have multiple grid
  // positions for the same candidate ID. In that case, we need to match on
  // party IDs as well.
  const gridPositionWithExpectedParties = allCandidateGridPositions.find((gp) =>
    deepEqual(
      [...(gp.partyIds ?? [])].sort() ?? [],
      [...(vote.partyIds ?? [])].sort()
    )
  );
  assert(gridPositionWithExpectedParties);
  return deepEqual(gridPositionWithExpectedParties, gridPos);
}
