import { deepEqual } from '@votingworks/basics';
import {
  BallotStyle,
  Candidate,
  CandidateContest,
  getOrderedCandidatesForContestInBallotStyle,
  GridPositionOption,
} from '@votingworks/types';

/**
 * Matches a vote to a grid position by using positional matching.
 *
 * For candidate contests with cross-endorsed candidates, the order of grid
 * positions maps to the order of OrderedCandidateOptions in the ballot style.
 * This allows us to correctly identify which specific bubble (with which party
 * affiliation) should be marked for a given vote.
 *
 * @param vote - The candidate vote to match
 * @param gridPos - The grid position to check
 * @param contest - The candidate contest
 * @param ballotStyle - The ballot style containing ordered candidates
 * @param allGridPositions - All grid positions for the ballot
 * @returns true if this grid position should be marked for the given vote
 */
export function voteMatchesGridPosition(
  vote: Candidate,
  gridPos: GridPositionOption,
  contest: CandidateContest,
  ballotStyle: BallotStyle,
  allGridPositions: readonly GridPositionOption[]
): boolean {
  // Get all grid positions for this contest and candidate ID
  const candidateGridPositions = allGridPositions.filter(
    (gp) => gp.contestId === contest.id && gp.optionId === vote.id
  );

  // Get ordered candidates for this contest
  const orderedCandidates = getOrderedCandidatesForContestInBallotStyle({
    contest,
    ballotStyle,
  });

  // Find candidates that match the vote's ID
  const matchingCandidates = orderedCandidates.filter((c) => c.id === vote.id);

  // Map each matching candidate to its corresponding grid position
  for (let i = 0; i < matchingCandidates.length; i += 1) {
    const candidate = matchingCandidates[i];
    const correspondingGridPos = candidateGridPositions[i];

    // Check if this is the grid position we're currently processing
    // and if the candidate matches the vote (including party IDs)
    if (correspondingGridPos === gridPos && deepEqual(vote, candidate)) {
      return true;
    }
  }

  return false;
}
