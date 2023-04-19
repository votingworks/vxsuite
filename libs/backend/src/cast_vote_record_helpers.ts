import { Optional, assert } from '@votingworks/basics';
import { CVR, ContestId, ContestOptionId, Side } from '@votingworks/types';

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
 * Information about a write in entry found in a cast vote record. `text`
 * indicates the text of the write-in which only applies to machine-marked
 * ballots. `side` indicates the side of the sheet for the corresponding
 * ballot image for a hand-written write-in. If `side` and `text` are undefined,
 * then the corresponding image for the hand-written write-in was not found and
 * the cast vote record may be invalid.
 */
export interface CastVoteRecordWriteIn {
  contestId: ContestId;
  optionId: ContestOptionId;
  side?: Side;
  text?: string;
}

/**
 * Gets the write-in votes from a CDF cast vote record. Asserts the current
 * snapshot exists.
 */
export function getWriteInsFromCastVoteRecord(
  cvr: CVR.CVR
): CastVoteRecordWriteIn[] {
  const currentSnapshot = getCurrentSnapshot(cvr);
  assert(currentSnapshot);

  const castVoteRecordWriteIns: CastVoteRecordWriteIn[] = [];

  for (const cvrContest of currentSnapshot.CVRContest) {
    for (const cvrContestSelection of cvrContest.CVRContestSelection) {
      for (const selectionPosition of cvrContestSelection.SelectionPosition) {
        const cvrWriteIn = selectionPosition.CVRWriteIn;
        if (
          selectionPosition.HasIndication === CVR.IndicationStatus.Yes &&
          cvrWriteIn
        ) {
          // Check for a BMD write-in
          if (cvrWriteIn.Text) {
            castVoteRecordWriteIns.push({
              contestId: cvrContest.ContestId,
              optionId: cvrContestSelection.ContestSelectionId,
              text: cvrWriteIn.Text,
            });
          } else {
            // Identify the sheet side a HMPB write-in
            const pageIndex = cvr.BallotImage?.findIndex(
              (cvrImageData) =>
                cvrImageData.Location &&
                cvrWriteIn.WriteInImage?.Location &&
                cvrImageData.Location === cvrWriteIn.WriteInImage.Location
            );
            castVoteRecordWriteIns.push({
              contestId: cvrContest.ContestId,
              optionId: cvrContestSelection.ContestSelectionId,
              side:
                pageIndex === undefined || pageIndex === -1
                  ? undefined
                  : pageIndex === 0
                  ? 'front'
                  : 'back',
            });
          }
        }
      }
    }
  }

  return castVoteRecordWriteIns;
}
