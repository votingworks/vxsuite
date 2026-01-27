import { sha256 } from 'js-sha256';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import {
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
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { FileSystemEntryType } from '@votingworks/fs';
import {
  AdjudicationReason,
  CVR,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  getGroupIdFromBallotStyleId,
  getPrecinctById,
  Id,
  Tabulation,
} from '@votingworks/types';
import { listDirectoryOnUsbDrive, UsbDrive } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  castVoteRecordHasValidContestReferences,
  convertCastVoteRecordMarkMetricsToMarkScores,
  CastVoteRecordWriteIn,
  convertCastVoteRecordVotesToTabulationVotes,
  generateElectionBasedSubfolderName,
  getCastVoteRecordBallotType,
  isFeatureFlagEnabled,
  parseCastVoteRecordReportExportDirectoryName,
  SCANNER_RESULTS_FOLDER,
  CachedElectionLookups,
} from '@votingworks/utils';

import { MarkScores } from '@votingworks/types/src/tabulation';
import { LogEventId, BaseLogger } from '@votingworks/logging';
import { Store } from './store';
import {
  CastVoteRecordElectionDefinitionValidationError,
  CastVoteRecordFileMetadata,
  CvrContestTag,
  CvrFileImportInfo,
  CvrFileMode,
  ImportCastVoteRecordsError,
} from './types';
import {
  CvrContestTagList,
  formatMarkScoreDistributionForLog,
  getCastVoteRecordAdjudicationFlags,
  getNumberVotesAllowed,
  MarkScoreDistribution,
  updateMarkScoreDistributionFromMarkScores,
} from './util/cast_vote_records';

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
 * The return type of {@link listCastVoteRecordExportsOnUsbDrive}
 */
export type ListCastVoteRecordExportsOnUsbDriveResult = Result<
  CastVoteRecordFileMetadata[],
  'found-file-instead-of-directory' | 'no-usb-drive' | 'permission-denied'
>;

/**
 * Lists the cast vote record exports on the inserted USB drive
 */
export async function listCastVoteRecordExportsOnUsbDrive(
  usbDrive: UsbDrive,
  electionDefinition: ElectionDefinition
): Promise<ListCastVoteRecordExportsOnUsbDriveResult> {
  const { election, ballotHash } = electionDefinition;

  const listResults = listDirectoryOnUsbDrive(
    usbDrive,
    path.join(
      generateElectionBasedSubfolderName(election, ballotHash),
      SCANNER_RESULTS_FOLDER
    )
  );

  const castVoteRecordExportSummaries: CastVoteRecordFileMetadata[] = [];

  for await (const result of listResults) {
    if (result.isErr()) {
      const errorType = result.err().type;
      switch (errorType) {
        case 'no-entity': {
          return ok([]);
        }
        case 'no-usb-drive':
        case 'usb-drive-not-mounted': {
          return err('no-usb-drive');
        }
        case 'not-directory': {
          return err('found-file-instead-of-directory');
        }
        case 'permission-denied': {
          /* istanbul ignore next: Hard to trigger without significant mocking @preserve */
          return err('permission-denied');
        }
        default: {
          /* istanbul ignore next: Compile-time check for completeness @preserve */
          throwIllegalValue(errorType);
        }
      }
    }

    const entry = result.ok();
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
        scannerIds: [exportDirectoryNameComponents.machineId],
      });
    }
  }

  return ok(
    [...castVoteRecordExportSummaries].sort(
      /* istanbul ignore next - @preserve */
      (a, b) => b.exportTimestamp.getTime() - a.exportTimestamp.getTime()
    )
  );
}

/**
 * Returns a list of contest tags for a given cvr based on
 * system settings.
 */
export function determineCvrContestTags({
  store,
  electionDefinition,
  cvrId,
  isHmpb,
  votes,
  writeIns,
  markScores,
}: {
  store: Store;
  electionDefinition: ElectionDefinition;
  cvrId: Id;
  isHmpb: boolean;
  votes: Tabulation.Votes;
  writeIns: CastVoteRecordWriteIn[];
  markScores?: MarkScores;
}): CvrContestTag[] {
  const electionId = assertDefined(store.getCurrentElectionId());
  const { adminAdjudicationReasons, markThresholds } =
    store.getSystemSettings(electionId);
  const shouldTagMarginalMarks = adminAdjudicationReasons.includes(
    AdjudicationReason.MarginalMark
  );
  const shouldTagOvervotes = adminAdjudicationReasons.includes(
    AdjudicationReason.Overvote
  );
  const shouldTagUndervotes = adminAdjudicationReasons.includes(
    AdjudicationReason.Undervote
  );
  console.log('is hmpb', isHmpb);

  // Write-ins
  const tagsByContestId = new CvrContestTagList(cvrId);
  for (const writeIn of writeIns) {
    const tag = tagsByContestId.getOrCreateTag(writeIn.contestId);
    if (writeIn.isUnmarked) {
      tag.hasUnmarkedWriteIn = true;
    } else {
      tag.hasWriteIn = true;
    }
  }

  // Marginal marks
  if (shouldTagMarginalMarks && isHmpb) {
    assert(
      markScores !== undefined,
      `mark scores expected for hmpb with 'MarginalMark' 
       adjudication reason set in system settings`
    );
    for (const [contestId, contestMarkScores] of Object.entries(markScores)) {
      for (const optionMarkScore of Object.values(contestMarkScores)) {
        const hasMarginalMark =
          optionMarkScore >= markThresholds.marginal &&
          optionMarkScore < markThresholds.definite;
        if (hasMarginalMark) {
          const tag = tagsByContestId.getOrCreateTag(contestId);
          tag.hasMarginalMark = true;
          break;
        }
      }
    }
  }

  // Overvotes, undervotes
  if (shouldTagOvervotes || shouldTagUndervotes) {
    for (const [contestId, optionIdsWithVotes] of Object.entries(votes)) {
      const contest = CachedElectionLookups.getContestById(
        electionDefinition,
        contestId
      );
      const votesAllowed = getNumberVotesAllowed(contest);
      const voteCount = optionIdsWithVotes.length;

      const hasOvervote = voteCount > votesAllowed;
      const hasUndervote = voteCount < votesAllowed;

      if (hasOvervote && shouldTagOvervotes) {
        const tag = tagsByContestId.getOrCreateTag(contestId);
        tag.hasOvervote = true;
      }

      if (hasUndervote && shouldTagUndervotes) {
        const tag = tagsByContestId.getOrCreateTag(contestId);
        tag.hasUndervote = true;
      }
    }
  }

  return tagsByContestId.toArray();
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
  const exportHash = sha256(JSON.stringify(castVoteRecordExportMetadata));
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

  return await store.withTransaction(async () => {
    const scannerIds = new Set<string>();
    for (const batch of batchManifest) {
      store.addScannerBatch({
        batchId: batch.id,
        electionId,
        label: batch.label,
        scannerId: batch.scannerId,
      });
      scannerIds.add(batch.scannerId);
    }

    // Create a top-level record for the import
    const importId = uuid();
    store.addCastVoteRecordFileRecord({
      id: importId,
      electionId,
      exportedTimestamp,
      filename: exportDirectoryName,
      isTestMode: isTestReport(castVoteRecordReportMetadata),
      scannerIds,
      sha256Hash: exportHash,
    });

    // Create a mark score distribution map with 0.1 increment buckets for logging
    const markScoreDistribution: MarkScoreDistribution = {
      distribution: new Map<number, number>(),
      total: 0,
    };
    for (let i = 1; i <= 20; i += 1) {
      markScoreDistribution.distribution.set(i / 100, 0);
    }

    let castVoteRecordIndex = 0;
    let newlyAdded = 0;
    let alreadyPresent = 0;
    const precinctIds = new Set<string>();
    for await (const castVoteRecordResult of castVoteRecordIterator) {
      if (castVoteRecordResult.isErr()) {
        return err({
          ...castVoteRecordResult.err(),
          index: castVoteRecordIndex,
        });
      }
      const {
        castVoteRecord,
        castVoteRecordBallotSheetId,
        castVoteRecordCurrentSnapshot,
        castVoteRecordOriginalSnapshot,
        castVoteRecordWriteIns,
        referencedFiles,
      } = castVoteRecordResult.ok();

      const validationResult = validateCastVoteRecordAgainstElectionDefinition(
        castVoteRecord,
        electionDefinition
      );
      if (validationResult.isErr()) {
        return err({ ...validationResult.err(), index: castVoteRecordIndex });
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
        votes,
        electionDefinition
      );
      const votingMethod = getCastVoteRecordBallotType(castVoteRecord);
      assert(votingMethod);
      const addCastVoteRecordResult = store.addCastVoteRecordFileEntry({
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
        cvrFileId: importId,
        electionId,
        adjudicationFlags,
      });
      if (addCastVoteRecordResult.isErr()) {
        return err({
          ...addCastVoteRecordResult.err(),
          index: castVoteRecordIndex,
        });
      }
      const { cvrId: castVoteRecordId, isNew: isCastVoteRecordNew } =
        addCastVoteRecordResult.ok();

      if (isCastVoteRecordNew) {
        const castVoteRecordContestTags = determineCvrContestTags({
          store,
          electionDefinition,
          cvrId: castVoteRecordId,
          isHmpb,
          votes,
          writeIns: castVoteRecordWriteIns,
          markScores,
        });
        if (castVoteRecordContestTags.length > 0) {
          for (const tag of castVoteRecordContestTags) {
            store.addCvrContestTag(tag);
          }

          // Guaranteed to be defined given validation in readCastVoteRecordExport
          assert(referencedFiles !== undefined);
          for (const i of [0, 1] as const) {
            const imageFileReadResult =
              await referencedFiles.imageFiles[i].read();
            if (imageFileReadResult.isErr()) {
              return err({
                ...imageFileReadResult.err(),
                index: castVoteRecordIndex,
              });
            }
            if (referencedFiles.layoutFiles !== undefined) {
              const layoutFileReadResult =
                await referencedFiles.layoutFiles[i].read();
              if (layoutFileReadResult.isErr()) {
                return err({
                  ...layoutFileReadResult.err(),
                  index: castVoteRecordIndex,
                });
              }
              store.addBallotImage({
                cvrId: castVoteRecordId,
                imageData: imageFileReadResult.ok(),
                pageLayout: layoutFileReadResult.ok(),
                side: (['front', 'back'] as const)[i],
              });
            } else {
              // bmd ballots do not have pageLayout information.
              store.addBallotImage({
                cvrId: castVoteRecordId,
                imageData: imageFileReadResult.ok(),
                side: (['front', 'back'] as const)[i],
              });
            }
          }
        }
        if (castVoteRecordWriteIns.length > 0) {
          for (const castVoteRecordWriteIn of castVoteRecordWriteIns) {
            store.addWriteIn({
              castVoteRecordId,
              contestId: castVoteRecordWriteIn.contestId,
              electionId,
              optionId: castVoteRecordWriteIn.optionId,
              side: castVoteRecordWriteIn.side || 'front', // BMD ballots are always on the front.
              isUnmarked: castVoteRecordWriteIn.isUnmarked,
              isUndetected: false,
              machineMarkedText: castVoteRecordWriteIn.text,
            });
          }
        }
        if (isHmpb && markScores) {
          updateMarkScoreDistributionFromMarkScores(
            markScoreDistribution,
            markScores
          );
        }
      }

      if (isCastVoteRecordNew) {
        newlyAdded += 1;
      } else {
        alreadyPresent += 1;
      }
      precinctIds.add(castVoteRecord.BallotStyleUnitId);

      castVoteRecordIndex += 1;
    }

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

    // TODO: Calculate the precinct list before iterating through cast vote records, once there is
    // only one geopolitical unit per batch
    store.updateCastVoteRecordFileRecord({
      id: importId,
      precinctIds,
    });

    return ok({
      id: importId,
      alreadyPresent,
      exportedTimestamp,
      fileMode: mode,
      fileName: exportDirectoryName,
      newlyAdded,
      wasExistingFile: false,
    });
  });
}
