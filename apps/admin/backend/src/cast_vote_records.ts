import path from 'node:path';
import * as fs from 'node:fs/promises';
import { createHash, randomUUID as uuid } from 'node:crypto';
import {
  type CastVoteRecordAndReferencedFiles,
  isTestReport,
  readCastVoteRecordExport,
  readCastVoteRecordExportMetadata,
} from '@votingworks/backend';
import {
  assert,
  assertDefined,
  err,
  iter,
  ok,
  type Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { FileSystemEntryType, listDirectory } from '@votingworks/fs';
import {
  type AdjudicationReason,
  asSheet,
  type BallotId,
  type BallotPageLayout,
  type CVR,
  type ElectionDefinition,
  getBallotStyle,
  getContests,
  getGroupIdFromBallotStyleId,
  getPrecinctById,
  mapSheet,
  type MarkThresholds,
  type SheetOf,
  type Tabulation,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  castVoteRecordHasValidContestReferences,
  convertCastVoteRecordMarkMetricsToMarkScores,
  convertCastVoteRecordVotesToTabulationVotes,
  generateElectionBasedSubfolderName,
  getCastVoteRecordBallotType,
  isFeatureFlagEnabled,
  parseCastVoteRecordReportExportDirectoryName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import { LogEventId, type BaseLogger } from '@votingworks/logging';
import type { Store } from './store.js';
import type {
  CastVoteRecordElectionDefinitionValidationError,
  CastVoteRecordFileMetadata,
  CvrFileImportInfo,
  CvrFileMode,
  ImportCastVoteRecordsError,
} from './types.js';
import {
  doesCvrNeedAdjudication,
  formatMarkScoreDistributionForLog,
  getCastVoteRecordAdjudicationFlags,
  type MarkScoreDistribution,
  updateMarkScoreDistributionFromMarkScores,
} from './util/cast_vote_records.js';

/**
 * Validates that the fields in a cast vote record and the election definition correspond
 */
function validateCastVoteRecordAgainstElectionDefinition(
  castVoteRecord: CVR.CVR,
  electionDefinition: ElectionDefinition
): Result<void, CastVoteRecordElectionDefinitionValidationError> {
  function wrapError(
    error: Omit<CastVoteRecordElectionDefinitionValidationError, 'type'>
  ): Result<void, CastVoteRecordElectionDefinitionValidationError> {
    return err({ ...error, type: 'invalid-cast-vote-record' });
  }

  const { election, ballotHash } = electionDefinition;

  if (
    castVoteRecord.ElectionId !== ballotHash &&
    !isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK
    )
  ) {
    return wrapError({ subType: 'election-mismatch' });
  }

  const precinct = getPrecinctById({
    election: electionDefinition.election,
    precinctId: castVoteRecord.BallotStyleUnitId,
  });
  if (!precinct) {
    return wrapError({ subType: 'precinct-not-found' });
  }

  const ballotStyle = getBallotStyle({
    ballotStyleId: castVoteRecord.BallotStyleId,
    election: electionDefinition.election,
  });
  if (!ballotStyle) {
    return wrapError({ subType: 'ballot-style-not-found' });
  }

  const contestValidationResult = castVoteRecordHasValidContestReferences(
    castVoteRecord,
    getContests({ ballotStyle, election })
  );
  if (contestValidationResult.isErr()) {
    return wrapError({ subType: contestValidationResult.err() });
  }

  return ok();
}

/**
 * The return type of {@link listCastVoteRecordExportsInDirectory}
 */
export type ListCastVoteRecordExportsInDirectory = Result<
  CastVoteRecordFileMetadata[],
  'found-file-instead-of-directory' | 'permission-denied'
>;

/**
 * Constructs the path relative to the root of a USB drive where cast vote
 * records should be stored for the given election.
 */
export function getCastVoteRecordsPath(
  electionDefinition: ElectionDefinition
): string {
  const { election, ballotHash } = electionDefinition;

  return path.join(
    generateElectionBasedSubfolderName(election, ballotHash),
    SCANNER_RESULTS_FOLDER
  );
}

/**
 * Lists the cast vote record exports in `directory`.
 */
export async function listCastVoteRecordExportsInDirectory(
  directory: string
): Promise<ListCastVoteRecordExportsInDirectory> {
  const castVoteRecordExportSummaries: CastVoteRecordFileMetadata[] = [];

  for await (const result of listDirectory(directory)) {
    if (result.isErr()) {
      const errorType = result.err().type;
      switch (errorType) {
        case 'no-entity': {
          return ok([]);
        }
        case 'not-directory': {
          return err('found-file-instead-of-directory');
        }
        // @coverage-defer
        case 'permission-denied': {
          // @coverage-exclude: Hard to trigger without significant mocking
          return err('permission-denied');
        }
        default: {
          throwIllegalValue(errorType);
        }
      }
    }

    const entry = result.ok();
    // @coverage-defer
    if (entry.type === FileSystemEntryType.Directory) {
      const exportDirectoryNameComponents =
        parseCastVoteRecordReportExportDirectoryName(entry.name);

      if (!exportDirectoryNameComponents) {
        continue;
      }

      const metadataResult = await readCastVoteRecordExportMetadata(entry.path);
      if (metadataResult.isErr()) {
        continue;
      }

      const metadata = metadataResult.ok();
      const scannerIds = new Set<string>();
      const pollingPlaceIds = new Set<string>();

      for (const batch of metadata.batchManifest) {
        scannerIds.add(batch.scannerId);
        pollingPlaceIds.add(batch.pollingPlaceId);
      }

      castVoteRecordExportSummaries.push({
        cvrCount: iter(metadata.batchManifest)
          .map((batch) => batch.sheetCount)
          .sum(),
        exportTimestamp: new Date(
          metadata.castVoteRecordReportMetadata.GeneratedDate
        ),
        isTestModeResults: exportDirectoryNameComponents.inTestMode,
        name: entry.name,
        path: entry.path,
        pollingPlaceIds: [...pollingPlaceIds],
        scannerIds: [...scannerIds],
      });
    }
  }

  return ok(
    [...castVoteRecordExportSummaries].sort(
      // @coverage-exclude
      (a, b) => b.exportTimestamp.getTime() - a.exportTimestamp.getTime()
    )
  );
}

/**
 * A cast vote record that has been parsed and validated and is ready to be
 * inserted into the store.
 */
export interface PreparedCastVoteRecord {
  ballotId: BallotId;
  cvr: Omit<Tabulation.CastVoteRecord, 'scannerId'>;
  adjudicationFlags: ReturnType<typeof getCastVoteRecordAdjudicationFlags>;
  needsAdjudication: boolean;
  writeIns: CastVoteRecordAndReferencedFiles['castVoteRecordWriteIns'];
  isHmpb: boolean;
  referencedFiles: CastVoteRecordAndReferencedFiles['referencedFiles'];
}

/**
 * Validates a parsed cast vote record against the election definition and
 * computes everything needed to insert it. Pure — performs no store writes —
 * so callers can do any async work (e.g. reading ballot images) before
 * inserting inside a synchronous transaction.
 */
export function prepareCastVoteRecord(
  parsed: CastVoteRecordAndReferencedFiles,
  electionDefinition: ElectionDefinition,
  systemSettings: {
    adminAdjudicationReasons: AdjudicationReason[];
    markThresholds: MarkThresholds;
  }
): Result<
  PreparedCastVoteRecord,
  CastVoteRecordElectionDefinitionValidationError
> {
  const {
    castVoteRecord,
    castVoteRecordBallotSheetId,
    castVoteRecordCurrentSnapshot,
    castVoteRecordOriginalSnapshot,
    castVoteRecordWriteIns,
    referencedFiles,
  } = parsed;

  const validationResult = validateCastVoteRecordAgainstElectionDefinition(
    castVoteRecord,
    electionDefinition
  );
  if (validationResult.isErr()) {
    return validationResult;
  }

  const votes = convertCastVoteRecordVotesToTabulationVotes(
    castVoteRecordCurrentSnapshot
  );
  // HMPB ballots have an original snapshot (for mark adjudication), while BMD ballots
  // (including multi-page BMD) do not. Multi-page BMD also has BallotSheetId, so we
  // can't use that alone to identify HMPB.
  const isHmpb = castVoteRecordOriginalSnapshot !== undefined;
  let markScores: Tabulation.MarkScores | undefined;
  if (isHmpb) {
    markScores = convertCastVoteRecordMarkMetricsToMarkScores(
      castVoteRecordOriginalSnapshot
    );
  }

  // Determine the card type:
  // - HMPB: has original snapshot and sheet number
  // - Multi-page BMD: has sheet number but no original snapshot
  // - Single-page BMD: no sheet number
  let card: Tabulation.Card;
  if (isHmpb) {
    assert(castVoteRecordBallotSheetId !== undefined);
    card = { type: 'hmpb', sheetNumber: castVoteRecordBallotSheetId };
  } else if (castVoteRecordBallotSheetId !== undefined) {
    // Multi-page BMD ballot
    card = { type: 'bmd', sheetNumber: castVoteRecordBallotSheetId };
  } else {
    // Single-page BMD ballot
    card = { type: 'bmd' };
  }

  // Currently, we only support filtering on initial adjudication status,
  // rather than post-adjudication status. As a result, we can just calculate
  // now, during import.
  const adjudicationFlags = getCastVoteRecordAdjudicationFlags(
    electionDefinition,
    votes,
    castVoteRecordWriteIns.length,
    isHmpb ? markScores : undefined,
    systemSettings.markThresholds
  );
  const votingMethod = assertDefined(
    getCastVoteRecordBallotType(castVoteRecord)
  );
  return ok({
    ballotId: castVoteRecord.UniqueId,
    cvr: {
      ballotStyleGroupId: getGroupIdFromBallotStyleId({
        ballotStyleId: castVoteRecord.BallotStyleId,
        election: electionDefinition.election,
      }),
      batchId: castVoteRecord.BatchId,
      card,
      precinctId: castVoteRecord.BallotStyleUnitId,
      markScores,
      votes,
      votingMethod,
    },
    adjudicationFlags,
    needsAdjudication: doesCvrNeedAdjudication(
      adjudicationFlags,
      systemSettings.adminAdjudicationReasons
    ),
    writeIns: castVoteRecordWriteIns,
    isHmpb,
    referencedFiles,
  });
}

/**
 * Whether a cast vote record's ballot images should be stored on import.
 * Today only records that need adjudication keep their images; this is the
 * single place to change if VxAdmin moves to storing images for every
 * record. Shared by the USB and network import paths.
 */
export function shouldStoreBallotImages(
  prepared: PreparedCastVoteRecord
): boolean {
  return prepared.needsAdjudication;
}

/** A ballot image read and written to a staging file, awaiting import. */
interface StagedBallotImage {
  imageFilePath: string;
  pageLayout?: BallotPageLayout;
}

interface StagedCastVoteRecord {
  prepared: PreparedCastVoteRecord;
  images?: SheetOf<StagedBallotImage>;
}

function newMarkScoreDistribution(): MarkScoreDistribution {
  // 0.1 increment buckets for logging
  const distribution = new Map<number, number>();
  for (let i = 1; i <= 20; i += 1) {
    distribution.set(i / 100, 0);
  }
  return { distribution, total: 0 };
}

/**
 * Imports cast vote records given a cast vote record export directory path
 */
export async function importCastVoteRecords(
  store: Store,
  exportDirectoryPath: string,
  logger: BaseLogger
): Promise<Result<CvrFileImportInfo, ImportCastVoteRecordsError>> {
  const electionId = assertDefined(store.getCurrentElectionId());
  const { electionDefinition } = assertDefined(store.getElection(electionId));

  const readResult = await readCastVoteRecordExport(exportDirectoryPath);
  if (readResult.isErr()) {
    return readResult;
  }
  const { castVoteRecordExportMetadata, castVoteRecordIterator } =
    readResult.ok();
  const { castVoteRecordReportMetadata, batchManifest } =
    castVoteRecordExportMetadata;

  const exportDirectoryName = path.basename(exportDirectoryPath);
  // Hashing the export metadata, which includes a root hash of all the individual cast vote
  // records, gives us a complete hash of the entire export
  const exportHash = createHash('sha256')
    .update(JSON.stringify(castVoteRecordExportMetadata))
    .digest('hex');
  const exportedTimestamp = castVoteRecordReportMetadata.GeneratedDate;

  // Ensure that the records to be imported match the mode (test vs. official) of previously
  // imported records
  const mode: CvrFileMode = isTestReport(castVoteRecordReportMetadata)
    ? 'test'
    : 'official';
  const currentMode = store.getCurrentCvrFileModeForElection(electionId);
  if (currentMode !== 'unlocked' && mode !== currentMode) {
    return err({ type: 'invalid-mode', currentMode });
  }

  const existingImportId = store.getCastVoteRecordFileByHash(
    electionId,
    exportHash
  );
  if (existingImportId) {
    return ok({
      id: existingImportId,
      alreadyPresent: store.getCastVoteRecordCountByFileId(existingImportId),
      exportedTimestamp,
      fileMode: mode,
      fileName: exportDirectoryName,
      newlyAdded: 0,
      wasExistingFile: true,
    });
  }

  const { adminAdjudicationReasons, markThresholds } =
    store.getSystemSettings(electionId);

  // Same filesystem as the ballot images, so staged images can be renamed in.
  const stagingDirectory = await fs.mkdtemp(
    path.join(path.dirname(store.getBallotImagesPath()), '.cvr-import-')
  );
  const markScoreDistribution = newMarkScoreDistribution();
  const staged: StagedCastVoteRecord[] = [];
  const precinctIds = new Set<string>();

  try {
    let castVoteRecordIndex = 0;
    for await (const castVoteRecordResult of castVoteRecordIterator) {
      if (castVoteRecordResult.isErr()) {
        return err({
          ...castVoteRecordResult.err(),
          index: castVoteRecordIndex,
        });
      }
      const prepareResult = prepareCastVoteRecord(
        castVoteRecordResult.ok(),
        electionDefinition,
        { adminAdjudicationReasons, markThresholds }
      );
      if (prepareResult.isErr()) {
        return err({ ...prepareResult.err(), index: castVoteRecordIndex });
      }
      const prepared = prepareResult.ok();

      let images: StagedCastVoteRecord['images'];
      if (
        shouldStoreBallotImages(prepared) &&
        !store.hasCastVoteRecord(electionId, prepared.ballotId)
      ) {
        // Guaranteed to be defined given validation in readCastVoteRecordExport
        assert(prepared.referencedFiles !== undefined);
        const stagedImages: StagedBallotImage[] = [];
        for (const i of [0, 1] as const) {
          const imageFileReadResult =
            await prepared.referencedFiles.imageFiles[i].read();
          if (imageFileReadResult.isErr()) {
            return err({
              ...imageFileReadResult.err(),
              index: castVoteRecordIndex,
            });
          }
          let pageLayout: BallotPageLayout | undefined;
          if (prepared.referencedFiles.layoutFiles !== undefined) {
            const layoutFileReadResult =
              await prepared.referencedFiles.layoutFiles[i].read();
            if (layoutFileReadResult.isErr()) {
              return err({
                ...layoutFileReadResult.err(),
                index: castVoteRecordIndex,
              });
            }
            pageLayout = layoutFileReadResult.ok();
          }
          const imageFilePath = path.join(
            stagingDirectory,
            `${castVoteRecordIndex}-${i}.img`
          );
          await fs.writeFile(imageFilePath, imageFileReadResult.ok());
          stagedImages.push({ imageFilePath, pageLayout });
        }
        images = asSheet(stagedImages);
      }

      staged.push({ prepared, images });
      precinctIds.add(prepared.cvr.precinctId);
      castVoteRecordIndex += 1;
    }

    const importResult = store.withTransaction(
      (): Result<CvrFileImportInfo, ImportCastVoteRecordsError> => {
        const scannerIds = new Set<string>();
        const pollingPlaceIds = new Set<string>();
        const batchIds: string[] = [];

        for (const batch of batchManifest) {
          store.addScannerBatch({
            batchId: batch.id,
            electionId,
            label: batch.label,
            scannerId: batch.scannerId,
            scannerMachineType: batch.scannerMachineType,
            ballotCastingMode: batch.ballotCastingMode,
            pollingPlaceId: batch.pollingPlaceId,
            startedAt: batch.startTime,
          });

          scannerIds.add(batch.scannerId);
          pollingPlaceIds.add(batch.pollingPlaceId);
          batchIds.push(batch.id);
        }

        // Create a top-level record for the import
        const importId = uuid();
        store.addCastVoteRecordFileRecord({
          id: importId,
          electionId,
          exportedTimestamp,
          filename: exportDirectoryName,
          isTestMode: isTestReport(castVoteRecordReportMetadata),
          pollingPlaceIds,
          scannerIds,
          batchIds,
          source: { type: 'usb', sha256Hash: exportHash },
        });

        let newlyAdded = 0;
        let alreadyPresent = 0;
        for (const [index, entry] of staged.entries()) {
          const { prepared, images } = entry;
          const addCastVoteRecordResult = store.addCastVoteRecordFileEntry({
            ballotId: prepared.ballotId,
            cvr: prepared.cvr,
            cvrFileId: importId,
            electionId,
            adjudicationFlags: prepared.adjudicationFlags,
          });
          if (addCastVoteRecordResult.isErr()) {
            return err({ ...addCastVoteRecordResult.err(), index });
          }
          const { cvrId: castVoteRecordId, isNew: isCastVoteRecordNew } =
            addCastVoteRecordResult.ok();

          if (isCastVoteRecordNew) {
            if (images) {
              mapSheet(images, (image, side) => {
                store.addBallotImageFromFile({
                  cvrId: castVoteRecordId,
                  electionDefinitionId: electionDefinition.election.id,
                  imageFilePath: image.imageFilePath,
                  pageLayout: image.pageLayout,
                  side,
                });
              });
            }
            for (const castVoteRecordWriteIn of prepared.writeIns) {
              store.addWriteIn({
                castVoteRecordId,
                contestId: castVoteRecordWriteIn.contestId,
                electionId,
                optionId: castVoteRecordWriteIn.optionId,
                isUnmarked: castVoteRecordWriteIn.isUnmarked,
                isUndetected: false,
                machineMarkedText: castVoteRecordWriteIn.text,
              });
            }
            if (prepared.isHmpb && prepared.cvr.markScores) {
              updateMarkScoreDistributionFromMarkScores(
                markScoreDistribution,
                prepared.cvr.markScores
              );
            }
            newlyAdded += 1;
          } else {
            alreadyPresent += 1;
          }
        }

        // TODO: Calculate the precinct list before iterating through cast vote records, once there is
        // only one geopolitical unit per batch
        store.updateCastVoteRecordFileRecord({ id: importId, precinctIds });

        return ok({
          id: importId,
          alreadyPresent,
          exportedTimestamp,
          fileMode: mode,
          fileName: exportDirectoryName,
          newlyAdded,
          wasExistingFile: false,
        });
      }
    );

    if (importResult.isOk()) {
      logger.log(
        LogEventId.ImportCastVoteRecordsMarkScoreDistribution,
        'election_manager',
        {
          disposition: 'success',
          message: 'Mark score distribution (0.01–0.20) from CVR import.',
          totalMarks: markScoreDistribution.total,
          distribution: formatMarkScoreDistributionForLog(
            markScoreDistribution.distribution
          ),
        }
      );
    }

    return importResult;
  } finally {
    await fs.rm(stagingDirectory, { recursive: true, force: true });
  }
}
