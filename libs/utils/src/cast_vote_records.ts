import { Optional, assert } from '@votingworks/basics';
import { CVR, Tabulation } from '@votingworks/types';

/**
 * Returns the current snapshot of a cast vote record, or undefined if none
 * exists. If undefined, the cast vote record is invalid.
 */
export function getCurrentSnapshot(cvr: CVR.CVR): Optional<CVR.CVRSnapshot> {
  return cvr.CVRSnapshot.find(
    (snapshot) => snapshot['@id'] === cvr.CurrentSnapshotId
  );
}

/**
 * Converts the vote data in the CDF cast vote record into the simple
 * dictionary of contest ids to contest selection ids that VxAdmin uses
 * internally as a basis for tallying votes.
 */
export function convertCastVoteRecordVotesToTabulationVotes(
  cvrSnapshot: CVR.CVRSnapshot
): Tabulation.Votes {
  const votes: Record<string, string[]> = {};
  for (const cvrContest of cvrSnapshot.CVRContest) {
    const contestSelectionIds: string[] = [];
    for (const cvrContestSelection of cvrContest.CVRContestSelection) {
      // We assume every contest selection has only one selection position,
      // which is true for standard voting but is not be true for ranked choice
      assert(cvrContestSelection.SelectionPosition.length === 1);
      const selectionPosition = cvrContestSelection.SelectionPosition[0];
      assert(selectionPosition);

      if (selectionPosition.HasIndication === CVR.IndicationStatus.Yes) {
        contestSelectionIds.push(cvrContestSelection.ContestSelectionId);
      }
    }

    votes[cvrContest.ContestId] = contestSelectionIds;
  }

  return votes;
}
