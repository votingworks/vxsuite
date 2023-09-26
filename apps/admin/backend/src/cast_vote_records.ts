/* c8 ignore start */
import * as fs from 'fs/promises';
import { sha256 } from 'js-sha256';
import path from 'path';
import { v4 as uuid } from 'uuid';
import {
  FileSystemEntryType,
  isTestReport,
  listDirectoryOnUsbDrive,
  readCastVoteRecordExport,
  readCastVoteRecordExportMetadata,
} from '@votingworks/backend';
import {
  assert,
  assertDefined,
  err,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  BallotId,
  BallotPageLayoutSchema,
  CVR,
  ElectionDefinition,
  getContests,
  safeParseJson,
} from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import {
  BooleanEnvironmentVariableName,
  castVoteRecordHasValidContestReferences,
  convertCastVoteRecordVotesToTabulationVotes,
  generateElectionBasedSubfolderName,
  getBallotStyleById,
  getPrecinctById,
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
import { buildGetUsbDrivesFn } from './util/exporter';

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

  const { election, electionHash } = electionDefinition;

  if (
    castVoteRecord.ElectionId !== electionHash &&
    !isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
    )
  ) {
    return wrapError({ subType: 'election-mismatch' });
  }

  const precinct = getPrecinctById(
    electionDefinition,
    castVoteRecord.BallotStyleUnitId
  );
  if (!precinct) {
    return wrapError({ subType: 'precinct-not-found' });
  }

  const ballotStyle = getBallotStyleById(
    electionDefinition,
    castVoteRecord.BallotStyleId
  );
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
 * Lists the cast vote record exports on the inserted USB drive
 */
export async function listCastVoteRecordExportsOnUsbDrive(
  usbDrive: UsbDrive,
  electionDefinition: ElectionDefinition
): Promise<
  Result<
    CastVoteRecordFileMetadata[],
    'found-file-instead-of-directory' | 'no-usb-drive' | 'permission-denied'
  >
> {
  const { election, electionHash } = electionDefinition;

  const listDirectoryResult = await listDirectoryOnUsbDrive(
    path.join(
      SCANNER_RESULTS_FOLDER,
      generateElectionBasedSubfolderName(election, electionHash)
    ),
    buildGetUsbDrivesFn(usbDrive)
  );
  if (listDirectoryResult.isErr()) {
    const errorType = listDirectoryResult.err().type;
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
        return err('permission-denied');
      }
      default: {
        throwIllegalValue(errorType);
      }
    }
  }

  const castVoteRecordExportSummaries: CastVoteRecordFileMetadata[] = [];
  for (const entry of listDirectoryResult.ok()) {
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
        cvrCount: metadata.castVoteRecordReportMetadata.vxBatch
          .map((batch) => batch.NumberSheets)
          .reduce((sum, n) => sum + n, 0),
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
  const { castVoteRecordReportMetadata } = castVoteRecordExportMetadata;

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
    for (const vxBatch of castVoteRecordReportMetadata.vxBatch) {
      store.addScannerBatch({
        batchId: vxBatch['@id'],
        electionId,
        label: vxBatch.BatchLabel,
        scannerId: vxBatch.CreatingDeviceId,
      });
      scannerIds.add(vxBatch.CreatingDeviceId);
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

      // Add an individual cast vote record to the import
      const votes = convertCastVoteRecordVotesToTabulationVotes(
        castVoteRecordCurrentSnapshot
      );
      const addCastVoteRecordResult = store.addCastVoteRecordFileEntry({
        ballotId: castVoteRecord.UniqueId as BallotId,
        cvr: {
          ballotStyleId: castVoteRecord.BallotStyleId,
          batchId: castVoteRecord.BatchId,
          card: castVoteRecordBallotSheetId
            ? { type: 'hmpb', sheetNumber: castVoteRecordBallotSheetId }
            : { type: 'bmd' },
          precinctId: castVoteRecord.BallotStyleUnitId,
          votes,
          votingMethod: castVoteRecord.vxBallotType,
        },
        cvrFileId: importId,
        electionId,
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
        const hmpbCastVoteRecordWriteIns = castVoteRecordWriteIns.filter(
          (castVoteRecordWriteIn) => castVoteRecordWriteIn.side
        );
        if (hmpbCastVoteRecordWriteIns.length > 0) {
          // Guaranteed to exist given validation in readCastVoteRecordExport
          assert(referencedFiles !== undefined);
          assert(referencedFiles.layoutFilePaths !== undefined);

          for (const i of [0, 1] as const) {
            const imageData = await fs.readFile(
              referencedFiles.imageFilePaths[i]
            );
            const parseLayoutResult = safeParseJson(
              await fs.readFile(referencedFiles.layoutFilePaths[i], 'utf8'),
              BallotPageLayoutSchema
            );
            if (parseLayoutResult.isErr()) {
              return err({
                type: 'invalid-cast-vote-record',
                subType: 'layout-parse-error',
                index: castVoteRecordIndex,
              });
            }
            store.addBallotImage({
              cvrId: castVoteRecordId,
              imageData,
              pageLayout: parseLayoutResult.ok(),
              side: (['front', 'back'] as const)[i],
            });
          }

          for (const hmpbCastVoteRecordWriteIn of hmpbCastVoteRecordWriteIns) {
            store.addWriteIn({
              castVoteRecordId,
              contestId: hmpbCastVoteRecordWriteIn.contestId,
              electionId,
              optionId: hmpbCastVoteRecordWriteIn.optionId,
              side: assertDefined(hmpbCastVoteRecordWriteIn.side),
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
/* c8 ignore stop */
