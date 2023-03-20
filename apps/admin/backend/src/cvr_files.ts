import {
  FileSystemEntryType,
  listDirectoryOnUsbDrive,
} from '@votingworks/backend';
import {
  assert,
  err,
  ok,
  integers,
  Result,
  throwIllegalValue,
  find,
} from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  AnyContest,
  BallotId,
  CastVoteRecord,
  CastVoteRecordBallotType,
  Contests,
  CVR,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  safeParseNumber,
} from '@votingworks/types';
import {
  generateElectionBasedSubfolderName,
  parseCastVoteRecordReportDirectoryName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import { join } from 'path';
import { CvrImportFormat } from './globals';
import { CastVoteRecordFileMetadata } from './types';
import { Usb } from './util/usb';

/**
 * Gets the metadata, including the path, of cast vote record files found in
 * the default location on a mounted USB drive. If there is no mounted USB
 * drive or the USB drive appears corrupted then it will return an empty array.
 */
export async function listCastVoteRecordFilesOnUsb(
  electionDefinition: ElectionDefinition,
  usb: Usb,
  logger: Logger,
  importFormat: CvrImportFormat = 'vxf'
): Promise<CastVoteRecordFileMetadata[]> {
  const { election, electionHash } = electionDefinition;
  const fileSearchResult = await listDirectoryOnUsbDrive(
    join(
      SCANNER_RESULTS_FOLDER,
      generateElectionBasedSubfolderName(election, electionHash)
    ),
    usb.getUsbDrives
  );

  if (fileSearchResult.isErr()) {
    const errorType = fileSearchResult.err().type;
    switch (errorType) {
      case 'no-entity':
        await logger.log(LogEventId.CvrFilesReadFromUsb, 'system', {
          message:
            'No cast vote record files automatically found on USB drive. User is allowed to manually select files.',
          disposition: 'success',
        });
        break;
      case 'not-directory':
      case 'permission-denied':
        await logger.log(LogEventId.CvrFilesReadFromUsb, 'system', {
          message:
            'Error accessing cast vote record files on USB drive, which may be corrupted.',
          disposition: 'failure',
        });
        break;
      case 'no-usb-drive':
      case 'usb-drive-not-mounted':
        // we're just polling without a USB drive in these cases, no issue
        break;
      default:
        throwIllegalValue(errorType);
    }

    return [];
  }

  const castVoteRecordFileMetadataList: CastVoteRecordFileMetadata[] = [];

  for (const entry of fileSearchResult.ok()) {
    if (
      (importFormat === 'vxf' &&
        entry.type === FileSystemEntryType.File &&
        entry.name.endsWith('.jsonl')) ||
      (importFormat === 'cdf' && entry.type === FileSystemEntryType.Directory)
    ) {
      const parsedFileInfo = parseCastVoteRecordReportDirectoryName(entry.name);
      if (parsedFileInfo) {
        castVoteRecordFileMetadataList.push({
          exportTimestamp: parsedFileInfo.timestamp,
          cvrCount: parsedFileInfo.numberOfBallots,
          isTestModeResults: parsedFileInfo.isTestModeResults,
          name: entry.name,
          path: entry.path,
          scannerIds: [parsedFileInfo.machineId],
        });
      }
    }
  }

  await logger.log(LogEventId.CvrFilesReadFromUsb, 'system', {
    message: `Found ${castVoteRecordFileMetadataList.length} CVR files on USB drive, user shown option to load.`,
    disposition: 'success',
  });

  return [...castVoteRecordFileMetadataList].sort(
    (a, b) => b.exportTimestamp.getTime() - a.exportTimestamp.getTime()
  );
}

// CVR Validation

function getValidContestOptions(contest: AnyContest) {
  if (contest.type === 'candidate') {
    return [
      ...contest.candidates.map((candidate) => candidate.id),
      ...integers({ from: 0, through: contest.seats - 1 })
        .map((num) => `write-in-${num}`)
        .toArray(),
    ];
  }
  return ['yes', 'no'];
}

type ContestReferenceError = 'invalid-contest' | 'invalid-contest-option';

/**
 * Checks whether all the contest and contest options referenced in a cast vote
 * record are indeed a part of the specified election.
 */
function snapshotHasValidContestReferences(
  snapshot: CVR.CVRSnapshot,
  electionContests: Contests
): Result<void, ContestReferenceError> {
  // TODO: this field should probably be required
  if (!snapshot.CVRContest) return ok();

  for (const cvrContest of snapshot.CVRContest) {
    const electionContest = electionContests.find(
      (contest) => contest.id === cvrContest.ContestId
    );
    if (!electionContest) return err('invalid-contest');

    const cvrContestSelections = cvrContest.CVRContestSelection;

    if (!cvrContestSelections) return ok();

    for (const cvrContestSelection of cvrContestSelections) {
      // TODO: this field should probably be required
      if (!cvrContestSelection.ContestSelectionId) return ok();
      if (
        !getValidContestOptions(electionContest).includes(
          cvrContestSelection.ContestSelectionId
        )
      ) {
        return err('invalid-contest-option');
      }
    }
  }

  return ok();
}

/**
 * Checks whether any images referenced by particular write-ins are included at
 * the top-level and are referenced by `CVR.BallotImage`
 */
function cvrHasValidWriteInImageReferences(cvr: CVR.CVR) {
  const ballotImageReferences = cvr.BallotImage?.map(
    (imageData) => imageData.Location
  ).filter((location): location is string => location !== undefined);

  if (!ballotImageReferences) return true;

  const writeInImageReferences = cvr.CVRSnapshot.flatMap(
    (snapshot) => snapshot.CVRContest
  )
    .filter(
      (cvrContest): cvrContest is CVR.CVRContest => cvrContest !== undefined
    )
    .flatMap((cvrContest) => cvrContest.CVRContestSelection)
    .filter(
      (cvrContestSelection): cvrContestSelection is CVR.CVRContestSelection =>
        cvrContestSelection !== undefined
    )
    .flatMap((cvrContestSelection) => cvrContestSelection.SelectionPosition)
    .filter(
      (selectionPosition): selectionPosition is CVR.SelectionPosition =>
        selectionPosition !== undefined
    )
    .map(
      (selectionPosition) =>
        selectionPosition.CVRWriteIn?.WriteInImage?.Location
    )
    .filter((location): location is string => location !== undefined);

  for (const writeInImageReference of writeInImageReferences) {
    if (!ballotImageReferences.includes(writeInImageReference)) return false;
  }

  return true;
}

type CastVoteRecordValidationError =
  | 'invalid-election'
  | 'invalid-ballot-style'
  | 'invalid-precinct'
  | 'invalid-batch'
  | 'invalid-sheet-number'
  | ContestReferenceError
  | 'invalid-ballot-image-location'
  | 'invalid-write-in-image-location'
  | 'no-current-snapshot';

/**
 * Checks if a parsed {@link CVR.CVR} is valid for a given election definition.
 *
 * @param cvr The parsed {@link CVR.CVR}
 * @param electionDefinition The election context
 * @param reportBallotImageLocations A list of images found in the report's
 * folder, which is used to confirm the images referenced by the CVR do exist
 */
export function validateCastVoteRecord({
  cvr,
  electionDefinition,
  reportBallotImageLocations,
  reportBatchIds,
}: {
  cvr: CVR.CVR;
  electionDefinition: ElectionDefinition;
  reportBallotImageLocations: string[];
  reportBatchIds: string[];
}): Result<void, CastVoteRecordValidationError> {
  const { election, electionHash } = electionDefinition;

  if (cvr.ElectionId !== electionHash) {
    return err('invalid-election');
  }

  if (
    !election.ballotStyles.some(
      (ballotStyle) => ballotStyle.id === cvr.BallotStyleId
    )
  ) {
    return err('invalid-ballot-style');
  }
  const ballotStyle = getBallotStyle({
    ballotStyleId: cvr.BallotStyleId,
    election,
  });
  assert(ballotStyle);

  if (
    !election.precincts.some(
      (precinct) => precinct.id === cvr.BallotStyleUnitId
    )
  ) {
    return err('invalid-precinct');
  }

  if (!reportBatchIds.some((reportBatchId) => reportBatchId === cvr.BatchId)) {
    return err('invalid-batch');
  }

  if (cvr.BallotSheetId) {
    // Only applicable to hand-marked paper ballots
    const parseBallotSheetIdResult = safeParseNumber(cvr.BallotSheetId);
    if (parseBallotSheetIdResult.isErr()) {
      // TODO: once layouts are in the election definition, we should check
      // whether the sheet number is within range for the ballot style
      return err('invalid-sheet-number');
    }
  }

  for (const snapshot of cvr.CVRSnapshot) {
    const contestValidation = snapshotHasValidContestReferences(
      snapshot,
      getContests({ ballotStyle, election })
    );
    if (contestValidation.isErr()) {
      return contestValidation;
    }
  }

  const ballotImageLocations = cvr.BallotImage?.map(
    (imageData) => imageData.Location
  ).filter((location): location is string => location !== undefined);

  if (ballotImageLocations) {
    for (const ballotImageLocation of ballotImageLocations) {
      if (!reportBallotImageLocations.includes(ballotImageLocation)) {
        return err('invalid-ballot-image-location');
      }
    }
  }

  if (!cvrHasValidWriteInImageReferences(cvr)) {
    return err('invalid-write-in-image-location');
  }

  if (
    !cvr.CVRSnapshot.find(
      (snapshot) => snapshot['@id'] === cvr.CurrentSnapshotId
    )
  ) {
    return err('no-current-snapshot');
  }

  return ok();
}

function cvrBallotTypeToLegacyBallotType(
  ballotType: CVR.vxBallotType
): CastVoteRecordBallotType {
  switch (ballotType) {
    case CVR.vxBallotType.Absentee:
      return 'absentee';
    case CVR.vxBallotType.Precinct:
      return 'standard';
    case CVR.vxBallotType.Provisional:
      return 'provisional';
    default:
      throwIllegalValue(ballotType);
  }
}

/**
 * Converts the vote data in the CDF cast vote record into the simple
 * dictionary of contest ids to contest selection ids that VxAdmin uses
 * internally as a basis for tallying votes.
 *
 * This method assumes that if a contest selection is present, then it an
 * indication. It ignores the possibility that there are multiple selection
 * positions within the contest selection (only applicable to ranked choice and
 * other forms of voting) or that the selection position has no indication.
 */
function convertCastVoteRecordVotesToLegacyVotes(
  cvrSnapshot: CVR.CVRSnapshot
): Record<string, string[]> {
  const votes: Record<string, string[]> = {};
  if (!cvrSnapshot.CVRContest) return votes;

  for (const cvrContest of cvrSnapshot.CVRContest) {
    if (!cvrContest.CVRContestSelection) continue;

    const contestSelectionIds: string[] = [];
    for (const cvrContestSelection of cvrContest.CVRContestSelection) {
      if (!cvrContestSelection.ContestSelectionId) continue;

      contestSelectionIds.push(cvrContestSelection.ContestSelectionId);
    }

    votes[cvrContest.ContestId] = contestSelectionIds;
  }

  return votes;
}

/**
 * Converts a cast vote record in CDF format ({@link CVR.CVR}) into the legacy
 * format still used for storage and tallying.
 */
export function convertCastVoteRecordToLegacyFormat({
  cvr,
  isTestReport,
  batchLabel,
}: {
  cvr: CVR.CVR;
  isTestReport: boolean;
  batchLabel: string;
}): CastVoteRecord {
  const currentSnapshot = find(
    cvr.CVRSnapshot,
    (snapshot) => snapshot['@id'] === cvr.CurrentSnapshotId
  );

  return {
    _ballotId: cvr.UniqueId as BallotId,
    _precinctId: cvr.BallotStyleUnitId,
    _batchId: cvr.BatchId,
    _batchLabel: batchLabel,
    _ballotStyleId: cvr.BallotStyleId,
    _ballotType: cvrBallotTypeToLegacyBallotType(cvr.vxBallotType),
    _scannerId: cvr.CreatingDeviceId,
    _testBallot: isTestReport,
    ...convertCastVoteRecordVotesToLegacyVotes(currentSnapshot),
  };
}
