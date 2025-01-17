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
  BallotId,
  BallotStyleId,
  CVR,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  getGroupIdFromBallotStyleId,
  getPrecinctById,
} from '@votingworks/types';
import { listDirectoryOnUsbDrive, UsbDrive } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  castVoteRecordHasValidContestReferences,
  convertCastVoteRecordVotesToTabulationVotes,
  generateElectionBasedSubfolderName,
  getCastVoteRecordBallotType,
  isFeatureFlagEnabled,
  parseCastVoteRecordReportExportDirectoryName,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';

import { Store } from './store';
import {
  CastVoteRecordElectionDefinitionValidationError,
  CastVoteRecordFileMetadata,
  CvrFileImportInfo,
  CvrFileMode,
  ImportCastVoteRecordsError,
} from './types';
import { getCastVoteRecordAdjudicationFlags } from './util/cast_vote_records';

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
    ballotStyleId: castVoteRecord.BallotStyleId as BallotStyleId,
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
 * Imports cast vote records given a cast vote record export directory path
 */
export async function importCastVoteRecords(
  store: Store,
  exportDirectoryPath: string
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
        ballotId: castVoteRecord.UniqueId as BallotId,
        cvr: {
          ballotStyleGroupId: getGroupIdFromBallotStyleId({
            ballotStyleId: castVoteRecord.BallotStyleId as BallotStyleId,
            election: electionDefinition.election,
          }),
          batchId: castVoteRecord.BatchId,
          card: castVoteRecordBallotSheetId
            ? { type: 'hmpb', sheetNumber: castVoteRecordBallotSheetId }
            : { type: 'bmd' },
          precinctId: castVoteRecord.BallotStyleUnitId,
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
        if (castVoteRecordWriteIns.length > 0) {
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

          for (const castVoteRecordWriteIn of castVoteRecordWriteIns) {
            store.addWriteIn({
              castVoteRecordId,
              contestId: castVoteRecordWriteIn.contestId,
              electionId,
              optionId: castVoteRecordWriteIn.optionId,
              side: castVoteRecordWriteIn.side || 'front', // BMD ballots are always on the front.
              isUnmarked: castVoteRecordWriteIn.isUnmarked,
              machineMarkedText: castVoteRecordWriteIn.text,
            });
          }
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
