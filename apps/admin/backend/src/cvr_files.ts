import {
  FileSystemEntryType,
  getCastVoteRecordReportImport,
  listDirectoryOnUsbDrive,
  validateCastVoteRecordReportDirectoryStructure,
  CastVoteRecordReportDirectoryStructureValidationError,
  CVR_BALLOT_IMAGES_SUBDIRECTORY,
  CVR_BALLOT_LAYOUTS_SUBDIRECTORY,
  isTestReport,
} from '@votingworks/backend';
import {
  assert,
  err,
  ok,
  integers,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  AnyContest,
  BallotId,
  BallotPageLayoutSchema,
  ContestOptionId,
  Contests,
  CVR,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  Iso8601Timestamp,
  safeParse,
  safeParseJson,
  safeParseNumber,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  CAST_VOTE_RECORD_REPORT_FILENAME,
  convertCastVoteRecordVotesToTabulationVotes,
  generateElectionBasedSubfolderName,
  getCurrentSnapshot,
  getWriteInsFromCastVoteRecord,
  isFeatureFlagEnabled,
  parseCastVoteRecordReportDirectoryName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import * as fs from 'fs/promises';
import { basename, join, normalize, parse } from 'path';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { authenticateArtifactUsingSignatureFile } from '@votingworks/auth';
import { Store } from './store';
import {
  CastVoteRecordFileMetadata,
  CvrFileImportInfo,
  CvrFileMode,
} from './types';
import { sha256File } from './util/sha256_file';
import { Usb } from './util/usb';
import { rootDebug } from './util/debug';

const debug = rootDebug.extend('cvr-files');

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
      /* c8 ignore next 2 */
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

    const validContestOptions = new Set(
      getValidContestOptions(electionContest)
    );
    for (const cvrContestSelection of cvrContest.CVRContestSelection) {
      if (!validContestOptions.has(cvrContestSelection.ContestSelectionId)) {
        return err('invalid-contest-option');
      }
    }
  }

  return ok();
}

/**
 * Checks whether any of the write-ins in the cast vote record are invalid
 * due to not referencing a top-level ballot image.
 */
function cvrHasValidWriteInImageReferences(cvr: CVR.CVR) {
  return getWriteInsFromCastVoteRecord(cvr).every(
    ({ side, text }) => side || text
  );
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

  if (
    cvr.ElectionId !== electionHash &&
    !isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
    )
  ) {
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

  if (!getCurrentSnapshot(cvr)) {
    return err('no-current-snapshot');
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

  return ok();
}

/**
 * Possible errors when importing a cast vote record reports.
 */
export type AddCastVoteRecordReportError =
  | {
      type: 'report-access-failure';
    }
  | {
      type: 'cast-vote-records-authentication-error';
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
      currentFileMode: CvrFileMode;
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
      return 'Unable to access cast vote record report for import.';
    case 'cast-vote-records-authentication-error':
      return 'Unable to authenticate cast vote records. Try exporting them from the scanner again.';
    case 'invalid-report-structure':
      return 'Cast vote record report has invalid file structure.';
    case 'malformed-report-metadata':
    case 'malformed-cast-vote-record':
      return 'Unable to parse cast vote record report, it may be malformed.';
    case 'invalid-report-file-mode':
      if (error.currentFileMode === 'official') {
        return `You are currently tabulating official results but the selected cast vote record report contains test results.`;
      }
      return `You are currently tabulating test results but the selected cast vote record report contains official results.`;
    case 'invalid-cast-vote-record': {
      const messageBase = `Found an invalid cast vote record at index ${error.index} in the current report.`;
      const messageDetail = (() => {
        const subErrorType = error.error;
        /* c8 ignore start */
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
            return 'The record references a ballot image which is not included in the report.';
          case 'no-current-snapshot':
            return `The record does not contain a current snapshot of the interpreted results.`;
          case 'invalid-contest':
            return `The record references a contest which does not exist for its ballot style.`;
          case 'invalid-contest-option':
            return `The record references a contest option which does not exist for the contest.`;
          default:
            throwIllegalValue(subErrorType);
          /* c8 ignore stop */
        }
      })();

      return `${messageBase} ${messageDetail}`;
    }
    case 'invalid-layout':
      return `Unable to parse a layout associated with a ballot image. Path: ${error.path}`;
    case 'ballot-id-already-exists-with-different-data':
      return `Found cast vote record at index ${error.index} that has the same ballot id as a previously imported cast vote record, but with different data.`;
    /* c8 ignore next 2 */
    default:
      throwIllegalValue(errorType);
  }
}

/**
 * Result of an attempt to import a cast vote record report.
 */
export type AddCastVoteRecordReportResult = Result<
  CvrFileImportInfo,
  AddCastVoteRecordReportError
>;

/**
 * Generates the expected absolute paths to the image and layout for a ballot
 * image specified in a CVR file. Only returns paths within the report
 * directory and will throw an error if the file reference points to a file
 * outside the report directory.
 *
 * @param cvrImageDataLocation File URI from the CVR file, e.g.
 *     `file:ballot-image/batch-1/something.jpg`
 * @param reportDirectoryPath Path to the root of the report
 */
function resolveImageAndLayoutPaths(
  cvrImageDataLocation: string,
  reportDirectoryPath: string
): {
  imagePath: string;
  layoutPath: string;
} {
  assert(cvrImageDataLocation.startsWith('file:'));
  const relativeImagePath = normalize(
    cvrImageDataLocation.slice('file:'.length)
  );
  assert(relativeImagePath.startsWith(`${CVR_BALLOT_IMAGES_SUBDIRECTORY}/`));
  const parsedBallotImagePath = parse(
    relativeImagePath.slice(`${CVR_BALLOT_IMAGES_SUBDIRECTORY}/`.length)
  );
  const imagePath = join(reportDirectoryPath, relativeImagePath);

  // Load layout data
  const layoutPath = join(
    reportDirectoryPath,
    CVR_BALLOT_LAYOUTS_SUBDIRECTORY,
    parsedBallotImagePath.dir,
    `${parsedBallotImagePath.name}.layout.json`
  );

  return { imagePath, layoutPath };
}

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
  debug('attempting to add a cast vote record report');
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);

  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const { electionDefinition } = electionRecord;

  const artifactAuthenticationResult =
    await authenticateArtifactUsingSignatureFile({
      type: 'legacy_cast_vote_records',
      directoryPath: reportDirectoryPath,
    });
  if (
    artifactAuthenticationResult.isErr() &&
    !isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
    )
  ) {
    return err({ type: 'cast-vote-records-authentication-error' });
  }
  debug('authenticated cast vote record report');

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
  debug('validated cast vote record report directory');

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
  debug('read cast vote record metadata from file');

  // Ensure the report matches the file mode of previous imports
  const reportFileMode = isTestReport(reportMetadata) ? 'test' : 'official';
  const currentFileMode = store.getCurrentCvrFileModeForElection(electionId);
  if (currentFileMode !== 'unlocked' && reportFileMode !== currentFileMode) {
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

    // Add records for all batches in report
    const scannerIds = new Set<string>();
    for (const vxBatch of reportMetadata.vxBatch) {
      store.addScannerBatch({
        batchId: vxBatch['@id'],
        label: vxBatch.BatchLabel,
        scannerId: vxBatch.CreatingDeviceId,
        electionId,
      });
      scannerIds.add(vxBatch.CreatingDeviceId);
    }

    // Add a file record which the cast vote records will link to
    const fileId = uuid();
    store.addCastVoteRecordFileRecord({
      id: fileId,
      electionId,
      isTestMode: isTestReport(reportMetadata),
      filename,
      exportedTimestamp,
      sha256Hash,
      scannerIds,
    });
    debug('added cast vote record file record %s', fileId);
    debug('begin importing individual cvrs...');

    // Iterate through all the cast vote records
    let castVoteRecordIndex = 0;
    const precinctIds = new Set<string>();
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
            `file:${join(CVR_BALLOT_IMAGES_SUBDIRECTORY, relativePath)}`
        ),
      });
      if (validationResult.isErr()) {
        return err({
          type: 'invalid-cast-vote-record',
          index: castVoteRecordIndex,
          error: validationResult.err(),
        });
      }

      // Add the cast vote record to the store
      const currentSnapshot = getCurrentSnapshot(cvr);
      assert(currentSnapshot);
      const votes =
        convertCastVoteRecordVotesToTabulationVotes(currentSnapshot);
      const addCastVoteRecordResult = store.addCastVoteRecordFileEntry({
        electionId,
        cvrFileId: fileId,
        ballotId: cvr.UniqueId as BallotId,
        cvr: {
          ballotStyleId: cvr.BallotStyleId,
          votingMethod: cvr.vxBallotType,
          batchId: cvr.BatchId,
          precinctId: cvr.BallotStyleUnitId,
          card: cvr.BallotSheetId
            ? {
                type: 'hmpb',
                // sheet number was previously validated
                sheetNumber: safeParseNumber(cvr.BallotSheetId).unsafeUnwrap(),
              }
            : { type: 'bmd' },
          votes,
        },
      });
      if (addCastVoteRecordResult.isErr()) {
        const errorType = addCastVoteRecordResult.err().type;
        switch (errorType) {
          case 'ballot-id-already-exists-with-different-data':
            return err({
              type: 'ballot-id-already-exists-with-different-data',
              index: castVoteRecordIndex,
            });
          /* c8 ignore next 2 */
          default:
            throwIllegalValue(errorType);
        }
      }
      const { cvrId, isNew: cvrIsNew } = addCastVoteRecordResult.ok();

      if (cvrIsNew) {
        // Add images to the store
        if (cvr.BallotImage) {
          // Convention is that we always have two entries in the BallotImage
          // array, allowing us to indicate front and back via array index.
          assert(cvr.BallotImage.length === 2);

          for (const [pageIndex, cvrImageData] of cvr.BallotImage.entries()) {
            // There may be no image data for the current page
            if (!cvrImageData.Location) {
              continue;
            }

            const { imagePath, layoutPath } = resolveImageAndLayoutPaths(
              cvrImageData.Location,
              reportDirectoryPath
            );

            // Load image data
            const imageData = await fs.readFile(imagePath);

            // Load and verify layout data
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

            // Add ballot image to store
            store.addBallotImage({
              cvrId,
              imageData,
              pageLayout: parseLayoutResult.ok(),
              side: pageIndex === 0 ? 'front' : 'back',
            });
          }
        }

        // Add write-ins to the store
        for (const castVoteRecordWriteIn of getWriteInsFromCastVoteRecord(
          cvr
        )) {
          // `side` existing implies that the ballot image exists, based
          // on previous validation
          if (castVoteRecordWriteIn.side) {
            store.addWriteIn({
              electionId,
              castVoteRecordId: cvrId,
              side: castVoteRecordWriteIn.side,
              contestId: castVoteRecordWriteIn.contestId,
              optionId: castVoteRecordWriteIn.optionId,
            });
          }
        }
      }

      // Update our ongoing data about the file relevant to the result
      if (cvrIsNew) {
        newlyAdded += 1;
      } else {
        alreadyPresent += 1;
      }
      precinctIds.add(cvr.BallotStyleUnitId);

      castVoteRecordIndex += 1;
    }
    debug('imported all cvrs');

    // TODO: Calculate the precinct list before iterating through records, once there is
    // only one geopolitical unit per batch in the future.
    store.updateCastVoteRecordFileRecord({
      id: fileId,
      precinctIds,
    });
    debug('updated cast vote record file record %s', fileId);

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
