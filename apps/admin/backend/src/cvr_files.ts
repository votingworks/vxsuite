import { Admin } from '@votingworks/api';
import {
  FileSystemEntryType,
  getCastVoteRecordReportImport,
  listDirectoryOnUsbDrive,
  validateCastVoteRecordReportDirectoryStructure,
  CastVoteRecordReportDirectoryStructureValidationError,
  CVR_BALLOT_IMAGES_SUBDIRECTORY,
  loadBallotImageBase64,
  CVR_BALLOT_LAYOUTS_SUBDIRECTORY,
  convertCastVoteRecordVotesToLegacyVotes,
  isTestReport,
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
  asSheet,
  BallotId,
  BallotPageLayout,
  BallotPageLayoutSchema,
  CastVoteRecord,
  CastVoteRecordBallotType,
  Contests,
  CVR,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  InlineBallotImage,
  Iso8601Timestamp,
  safeParse,
  safeParseJson,
  safeParseNumber,
} from '@votingworks/types';
import {
  CAST_VOTE_RECORD_REPORT_FILENAME,
  generateElectionBasedSubfolderName,
  parseCastVoteRecordReportDirectoryName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import * as fs from 'fs/promises';
import { basename, join } from 'path';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { Store } from './store';
import { CastVoteRecordFileMetadata } from './types';
import { sha256File } from './util/sha256_file';
import { Usb } from './util/usb';
import { getWriteInsFromCastVoteRecord } from './util/cvrs';

/**
 * Gets the metadata, including the path, of cast vote record files found in
 * the default location on a mounted USB drive. If there is no mounted USB
 * drive or the USB drive appears corrupted then it will return an empty array.
 */
export async function listCastVoteRecordFilesOnUsb(
  electionDefinition: ElectionDefinition,
  usb: Usb,
  logger: Logger
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
      /* istanbul ignore next: compile-time check for completeness */
      default:
        throwIllegalValue(errorType);
    }

    return [];
  }

  const castVoteRecordFileMetadataList: CastVoteRecordFileMetadata[] = [];

  for (const entry of fileSearchResult.ok()) {
    if (entry.type === FileSystemEntryType.Directory) {
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
  for (const cvrContest of snapshot.CVRContest) {
    const electionContest = electionContests.find(
      (contest) => contest.id === cvrContest.ContestId
    );
    if (!electionContest) return err('invalid-contest');

    for (const cvrContestSelection of cvrContest.CVRContestSelection) {
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
    .flatMap((cvrContest) => cvrContest.CVRContestSelection)
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
    /* istanbul ignore next: compile-time check for completeness */
    default:
      throwIllegalValue(ballotType);
  }
}

/**
 * Converts a cast vote record in CDF format ({@link CVR.CVR}) into the legacy
 * format still used for storage and tallying.
 */
export function convertCastVoteRecordToLegacyFormat({
  cvr,
  isTest,
  batchLabel,
}: {
  cvr: CVR.CVR;
  isTest: boolean;
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
    _testBallot: isTest,
    ...convertCastVoteRecordVotesToLegacyVotes(currentSnapshot),
  };
}

/**
 * Possible errors when importing a cast vote record reports.
 */
export type AddCastVoteRecordReportError =
  | {
      type: 'report-access-failure';
    }
  | {
      type: 'invalid-report-structure';
      error: CastVoteRecordReportDirectoryStructureValidationError;
    }
  | {
      type: 'malformed-report-metadata';
      error: z.ZodError;
    }
  | {
      type: 'malformed-cast-vote-record';
      index: number;
      error: z.ZodError;
    }
  | {
      type: 'invalid-cast-vote-record';
      index: number;
      error: CastVoteRecordValidationError;
    }
  | {
      type: 'invalid-layout';
      path: string;
      error: z.ZodError | SyntaxError;
    }
  | {
      type: 'invalid-report-file-mode';
      currentFileMode: Admin.CvrFileMode;
    }
  | {
      type: 'ballot-id-already-exists-with-different-data';
      index: number;
    };

/**
 * Convert a {@link AddCastVoteRecordReportError} to a human readable message
 * for logging and presentation to the user.
 */
export function getAddCastVoteRecordReportErrorMessage(
  error: AddCastVoteRecordReportError
): string {
  const errorType = error.type;
  switch (errorType) {
    case 'report-access-failure':
      return 'Failed to access cast vote record report for import.';
    case 'invalid-report-structure':
      return 'Cast vote record report has invalid file structure.';
    case 'malformed-report-metadata':
    case 'malformed-cast-vote-record':
      return 'Unable to parse cast vote record report, it may be malformed.';
    case 'invalid-report-file-mode':
      if (error.currentFileMode === Admin.CvrFileMode.Official) {
        return `You are currently tabulating official results but the selected cast vote record report contains test results.`;
      }
      return `You are currently tabulating test results but the selected cast vote record report contains official results.`;
    case 'invalid-cast-vote-record': {
      const messageBase = `Found an invalid cast vote record at index ${error.index} in the current report.`;
      const messageDetail = (() => {
        const subErrorType = error.error;
        /* istanbul ignore next  - write testing when error handling requirements and implementation harden */
        switch (subErrorType) {
          case 'invalid-election':
            return `The record references an election other than the current election.`;
          case 'invalid-ballot-style':
            return `The record references an non-existent ballot style.`;
          case 'invalid-batch':
            return `The record references a scanning batch not detailed in the report.`;
          case 'invalid-precinct':
            return `The record references an non-existent precinct.`;
          case 'invalid-sheet-number':
            return `The record references an invalid sheet number.`;
          case 'invalid-ballot-image-location':
          case 'invalid-write-in-image-location':
            return `The record references a ballot image which is not included in the report`;
          case 'no-current-snapshot':
            return `The record does not contain a current snapshot of the interpreted results.`;
          case 'invalid-contest':
            return `The record references a contest which does not exist for its ballot style.`;
          case 'invalid-contest-option':
            return `The record references a contest option which does not exist for the contest.`;
          /* istanbul ignore next: compile-time check for completeness */
          default:
            throwIllegalValue(subErrorType);
        }
      })();

      return `${messageBase} ${messageDetail}`;
    }
    case 'invalid-layout':
      return `Unable to parse a layout associated with a ballot image. Path: ${error.path}`;
    case 'ballot-id-already-exists-with-different-data':
      return `Found cast vote record at index ${error.index} that has the same ballot id as a previously imported cast vote record, but with different data.`;
    /* istanbul ignore next: compile-time check for completeness */
    default:
      throwIllegalValue(errorType);
  }
}

/**
 * Result of an attempt to import a cast vote record report.
 */
export type AddCastVoteRecordReportResult = Result<
  Admin.CvrFileImportInfo,
  AddCastVoteRecordReportError
>;

/**
 * Attempts to add a cast vote record report.
 */
export async function addCastVoteRecordReport({
  store,
  reportDirectoryPath,
  exportedTimestamp,
}: {
  store: Store;
  reportDirectoryPath: string;
  exportedTimestamp: Iso8601Timestamp;
}): Promise<AddCastVoteRecordReportResult> {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);

  const electionDefinition = store.getElection(electionId)?.electionDefinition;
  assert(electionDefinition);

  // Check whether this directory looks like a valid report directory
  const directoryValidationResult =
    await validateCastVoteRecordReportDirectoryStructure(reportDirectoryPath);
  if (directoryValidationResult.isErr()) {
    return err({
      type: 'invalid-report-structure',
      error: directoryValidationResult.err(),
    });
  }
  const relativeBallotImagePaths = directoryValidationResult.ok();
  const reportPath = join(
    reportDirectoryPath,
    CAST_VOTE_RECORD_REPORT_FILENAME
  );

  // We are hashing only the JSON report here - perhaps we should hash some
  // structure of the report directory as well or even the images.
  const sha256Hash = await sha256File(reportPath);
  const filename = basename(reportDirectoryPath);

  // Parse the report metadata and get an iterator for the cast vote records
  const getCastVoteRecordReportImportResult =
    await getCastVoteRecordReportImport(reportPath);
  if (getCastVoteRecordReportImportResult.isErr()) {
    return err({
      type: 'malformed-report-metadata',
      error: getCastVoteRecordReportImportResult.err(),
    });
  }
  const { CVR: unparsedCastVoteRecords, ...reportMetadata } =
    getCastVoteRecordReportImportResult.ok();

  // Ensure the report matches the file mode of previous imports
  const reportFileMode = isTestReport(reportMetadata)
    ? Admin.CvrFileMode.Test
    : Admin.CvrFileMode.Official;
  const currentFileMode = store.getCurrentCvrFileModeForElection(electionId);
  if (
    currentFileMode !== Admin.CvrFileMode.Unlocked &&
    reportFileMode !== currentFileMode
  ) {
    return err({
      type: 'invalid-report-file-mode',
      currentFileMode,
    });
  }

  return await store.withTransaction(async () => {
    const existingFileId = store.getCastVoteRecordFileByHash(
      electionId,
      sha256Hash
    );

    if (existingFileId) {
      return ok({
        id: existingFileId,
        exportedTimestamp,
        fileMode: currentFileMode,
        fileName: filename,
        wasExistingFile: true,
        newlyAdded: 0,
        alreadyPresent: store.getCastVoteRecordCountByFileId(existingFileId),
      });
    }

    // Add a file record which the cast vote records will link to
    const fileId = uuid();
    store.addInitialCastVoteRecordFileRecord({
      id: fileId,
      electionId,
      filename,
      exportedTimestamp,
      sha256Hash,
    });

    // Iterate through all the cast vote records
    let castVoteRecordIndex = 0;
    const precinctIds = new Set<string>();
    const scannerIds = new Set<string>();
    let newlyAdded = 0;
    let alreadyPresent = 0;
    for await (const unparsedCastVoteRecord of unparsedCastVoteRecords) {
      // Parse the text data
      const parseResult = safeParse(CVR.CVRSchema, unparsedCastVoteRecord);
      if (parseResult.isErr()) {
        return err({
          type: 'malformed-cast-vote-record',
          index: castVoteRecordIndex,
          error: parseResult.err(),
        });
      }
      const cvr = parseResult.ok();

      // Validate the resulting cast vote record
      const validationResult = validateCastVoteRecord({
        cvr,
        electionDefinition,
        reportBatchIds: reportMetadata.vxBatch.map((batch) => batch['@id']),
        reportBallotImageLocations: relativeBallotImagePaths.map(
          (relativePath) =>
            `file:./${join(CVR_BALLOT_IMAGES_SUBDIRECTORY, relativePath)}`
        ),
      });
      if (validationResult.isErr()) {
        return err({
          type: 'invalid-cast-vote-record',
          index: castVoteRecordIndex,
          error: validationResult.err(),
        });
      }

      // Convert the cast vote record to the format our store and tally logic use
      let legacyCastVoteRecord = convertCastVoteRecordToLegacyFormat({
        cvr,
        isTest: reportFileMode === Admin.CvrFileMode.Test,
        batchLabel: find(
          reportMetadata.vxBatch,
          (batch) => batch['@id'] === cvr.BatchId
        ).BatchLabel,
      });

      // Add referenced images and layouts to the cast vote record
      if (cvr.BallotImage) {
        // Convention is that we always have two entries in the BallotImage
        // array, allowing us to indicate front and back via array index.
        assert(cvr.BallotImage.length === 2);
        const ballotImages: Array<InlineBallotImage | null> = [];
        const ballotLayouts: Array<BallotPageLayout | null> = [];

        for (const cvrImageData of cvr.BallotImage) {
          if (!cvrImageData.Location) {
            ballotImages.push(null);
            ballotLayouts.push(null);
            continue;
          }

          // Add image from file in base 64 format.
          assert(cvrImageData.Location.startsWith('file:'));
          const imagePath = join(
            reportDirectoryPath,
            cvrImageData.Location.slice('file:'.length)
          );
          ballotImages.push({
            normalized: await loadBallotImageBase64(imagePath),
          });

          // Add layout from file
          const layoutPath = imagePath
            .replace(
              CVR_BALLOT_IMAGES_SUBDIRECTORY,
              CVR_BALLOT_LAYOUTS_SUBDIRECTORY
            )
            .replace(/(jpg|jpeg)$/, 'layout.json');
          const parseLayoutResult = safeParseJson(
            await fs.readFile(layoutPath, 'utf8'),
            BallotPageLayoutSchema
          );
          if (parseLayoutResult.isErr()) {
            return err({
              type: 'invalid-layout',
              error: parseLayoutResult.err(),
              path: layoutPath,
            });
          }
          ballotLayouts.push(parseLayoutResult.ok());
        }

        legacyCastVoteRecord = {
          ...legacyCastVoteRecord,
          _ballotImages: asSheet(ballotImages),
          _layouts: asSheet(ballotLayouts),
        };
      }

      // Add the cast vote record to the store
      const cvrData = JSON.stringify(legacyCastVoteRecord);
      const addCastVoteRecordResult = store.addCastVoteRecordFileEntry(
        electionId,
        fileId,
        cvr.UniqueId as BallotId,
        cvrData
      );
      if (addCastVoteRecordResult.isErr()) {
        return err({
          type: 'ballot-id-already-exists-with-different-data',
          index: castVoteRecordIndex,
        });
      }
      const { id: cvrId, isNew: cvrIsNew } = addCastVoteRecordResult.ok();

      // Update our ongoing data about the file relevant to the result
      if (cvrIsNew) {
        newlyAdded += 1;
      } else {
        alreadyPresent += 1;
      }
      precinctIds.add(cvr.BallotStyleUnitId);
      scannerIds.add(cvr.CreatingDeviceId);

      // Add the write-in records to the store
      for (const [contestId, writeInIds] of getWriteInsFromCastVoteRecord(
        legacyCastVoteRecord
      )) {
        for (const optionId of writeInIds) {
          store.addWriteIn({
            castVoteRecordId: cvrId,
            contestId,
            optionId,
          });
        }
      }

      castVoteRecordIndex += 1;
    }

    // Update the cast vote file record with information we learned by
    // iterating through the records.
    //
    // TODO: we should have the precinct and scanner list at the top-level of
    // the report, which would allow this data to be stored up front
    store.updateCastVoteRecordFileRecord({
      id: fileId,
      precinctIds,
      scannerIds,
    });

    return ok({
      id: fileId,
      alreadyPresent,
      exportedTimestamp,
      fileMode: reportFileMode,
      fileName: filename,
      newlyAdded,
      wasExistingFile: false,
    });
  });
}
