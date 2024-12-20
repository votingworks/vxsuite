import { promises as fs } from 'node:fs';
import {
  assert,
  err,
  integers,
  ok,
  Optional,
  Result,
  throwIllegalValue,
  typedAs,
} from '@votingworks/basics';
import {
  AnyContest,
  BallotType,
  CastVoteRecordExportFileName,
  ContestId,
  ContestOptionId,
  Contests,
  CVR,
  CVRSnapshotOtherStatus,
  CVRSnapshotOtherStatusSchema,
  safeParse,
  safeParseJson,
  Side,
  Tabulation,
} from '@votingworks/types';

export const UNMARKED_WRITE_IN_SELECTION_POSITION_OTHER_STATUS =
  'unmarked-write-in';

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
 * Because there is no place for "Absentee" vs. "Precinct" ballot on the CDF
 * for cast vote records, we shove it into the `OtherStatus` field of the
 * `CVRSnapshot`. This tool formats that metadata, which can then be included
 * in a `CVRSnapshot`.
 */
export function buildCVRSnapshotBallotTypeMetadata(
  ballotType: BallotType
): Pick<CVR.CVRSnapshot, 'Status' | 'OtherStatus'> {
  return {
    Status: [CVR.CVRStatus.Other],
    OtherStatus: JSON.stringify(
      typedAs<CVRSnapshotOtherStatus>({
        ballotType,
      })
    ),
  };
}

/**
 * Extracts the ballot type (e.g. absentee vs. precinct) from a cast vote
 * record. We have the ballot type serialized within the `OtherStatus` field
 * of `CVRSnapshot`, this helper is for easier access to that data. It returns
 * undefined if the data is not present - callers are responsible for making
 * sure that the data exists.
 */
export function getCastVoteRecordBallotType(
  cvr: CVR.CVR
): Optional<BallotType> {
  const currentSnapshot = getCurrentSnapshot(cvr);
  if (
    !currentSnapshot ||
    !currentSnapshot.Status ||
    !currentSnapshot.Status.includes(CVR.CVRStatus.Other) ||
    !currentSnapshot.OtherStatus
  ) {
    return;
  }

  const otherStatusParseJsonResult = safeParseJson(currentSnapshot.OtherStatus);
  if (otherStatusParseJsonResult.isErr()) return;

  const otherStatusParseResult = safeParse(
    CVRSnapshotOtherStatusSchema,
    otherStatusParseJsonResult.ok()
  );
  if (otherStatusParseResult.isErr()) return;

  return otherStatusParseResult.ok().ballotType;
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
      // which is true for standard voting but would not be true for ranked choice
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
  /** Means that the write-in is not accompanied by a filled bubble */
  isUnmarked?: boolean;
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
          cvrWriteIn &&
          (selectionPosition.HasIndication === CVR.IndicationStatus.Yes ||
            selectionPosition.OtherStatus ===
              UNMARKED_WRITE_IN_SELECTION_POSITION_OTHER_STATUS)
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
              isUnmarked:
                selectionPosition.OtherStatus ===
                UNMARKED_WRITE_IN_SELECTION_POSITION_OTHER_STATUS,
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
    /* istanbul ignore next */
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
 * Gets the names of the sub-directories in a cast vote record export
 */
export async function getCastVoteRecordExportSubDirectoryNames(
  exportDirectoryPath: string
): Promise<string[]> {
  return (await fs.readdir(exportDirectoryPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((directory) => directory.name);
}

/**
 * Gets the IDs of the cast vote records in a cast vote record export
 */
export async function getExportedCastVoteRecordIds(
  exportDirectoryPath: string
): Promise<string[]> {
  return (
    await getCastVoteRecordExportSubDirectoryNames(exportDirectoryPath)
  ).filter(
    (subDirectoryName) =>
      !subDirectoryName.startsWith(
        CastVoteRecordExportFileName.REJECTED_SHEET_SUB_DIRECTORY_NAME_PREFIX
      )
  );
}
