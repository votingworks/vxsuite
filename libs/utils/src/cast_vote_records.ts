import { promises as fs } from 'fs';
import {
  assert,
  err,
  integers,
  ok,
  Optional,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  AnyContest,
  ContestId,
  ContestOptionId,
  Contests,
  CVR,
  Side,
  Tabulation,
} from '@votingworks/types';

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

/**
 * Our BMD write-ins use the CDF `Text` field on the {@link CVR.CVRWriteIn},
 * so it is our test for whether a write-in came from a BMD or HMPB.
 */
export function isBmdWriteIn(cvrWriteIn: CVR.CVRWriteIn): boolean {
  return Boolean(cvrWriteIn.Text);
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
          if (isBmdWriteIn(cvrWriteIn)) {
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

/**
 * Checks whether a cast vote record write-in is valid. See {@link CastVoteRecordWriteIn} for more
 * context.
 */
export function isCastVoteRecordWriteInValid(
  cvrWriteIn: CastVoteRecordWriteIn
): boolean {
  return Boolean(cvrWriteIn.side || cvrWriteIn.text);
}

function getValidContestOptions(contest: AnyContest): ContestOptionId[] {
  switch (contest.type) {
    case 'candidate':
      return [
        ...contest.candidates.map((candidate) => candidate.id),
        ...integers({ from: 0, through: contest.seats - 1 })
          .map((num) => `write-in-${num}`)
          .toArray(),
      ];
    case 'yesno':
      return [contest.yesOption.id, contest.noOption.id];
    /* c8 ignore next 2 */
    default:
      return throwIllegalValue(contest);
  }
}

export type ContestReferenceError =
  | 'contest-not-found'
  | 'contest-option-not-found';

/**
 * Checks whether all the contest and contest options referenced in a cast vote record are indeed a
 * part of the specified election
 */
export function castVoteRecordHasValidContestReferences(
  cvr: CVR.CVR,
  electionContests: Contests
): Result<void, ContestReferenceError> {
  for (const cvrSnapshot of cvr.CVRSnapshot) {
    for (const cvrContest of cvrSnapshot.CVRContest) {
      const electionContest = electionContests.find(
        (contest) => contest.id === cvrContest.ContestId
      );
      if (!electionContest) {
        return err('contest-not-found');
      }

      const validContestOptions = new Set(
        getValidContestOptions(electionContest)
      );
      for (const cvrContestSelection of cvrContest.CVRContestSelection) {
        if (!validContestOptions.has(cvrContestSelection.ContestSelectionId)) {
          return err('contest-option-not-found');
        }
      }
    }
  }

  return ok();
}

/**
 * Returns a list of cast vote record IDs given an export directory path
 */
export async function getExportedCastVoteRecordIds(
  exportDirectoryPath: string
): Promise<string[]> {
  const castVoteRecordIds = (
    await fs.readdir(exportDirectoryPath, { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((directory) => directory.name);
  return castVoteRecordIds;
}
