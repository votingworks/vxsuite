import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { authenticateArtifactUsingSignatureFile } from '@votingworks/auth';
import {
  assert,
  assertDefined,
  AsyncIteratorPlus,
  err,
  iter,
  ok,
  Result,
} from '@votingworks/basics';
import {
  BallotPageLayout,
  CastVoteRecordExportFileName,
  CastVoteRecordExportMetadata,
  CastVoteRecordExportMetadataSchema,
  CastVoteRecordReportWithoutMetadataSchema,
  CVR,
  mapSheet,
  ReadCastVoteRecordError,
  ReadCastVoteRecordExportError,
  ReadCastVoteRecordExportMetadataError,
  safeParseJson,
  safeParseNumber,
  SheetOf,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  CastVoteRecordWriteIn,
  getCurrentSnapshot,
  getExportedCastVoteRecordIds,
  getOriginalSnapshot,
  getWriteInsFromCastVoteRecord,
  isCastVoteRecordWriteInValid,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

import { TEST_OTHER_REPORT_TYPE } from './build_report_metadata';
import {
  ReferencedFile,
  ReferencedFiles,
  referencedImageFile,
  referencedLayoutFile,
} from './referenced_files';
import { getImageHash, getLayoutHash } from './build_cast_vote_record';

/**
 * A parsed cast vote record plus readers for the files that it references
 */
export interface CastVoteRecordAndReferencedFiles {
  castVoteRecord: CVR.CVR;
  castVoteRecordBallotSheetId?: number;
  castVoteRecordCurrentSnapshot: CVR.CVRSnapshot;
  castVoteRecordOriginalSnapshot?: CVR.CVRSnapshot;
  castVoteRecordWriteIns: CastVoteRecordWriteIn[];
  referencedFiles?: ReferencedFiles;
}

interface CastVoteRecordExportContents {
  castVoteRecordExportMetadata: CastVoteRecordExportMetadata;
  castVoteRecordIterator: AsyncIteratorPlus<
    Result<CastVoteRecordAndReferencedFiles, ReadCastVoteRecordError>
  >;
}

/**
 * Reads and parses a cast vote record export's metadata file. Does *not* authenticate the export
 * so should only be used if you're 1) handling authentication elsewhere or 2) using the metadata
 * for a non-critical purpose like listing exports in a UI before import.
 */
export async function readCastVoteRecordExportMetadata(
  exportDirectoryPath: string
): Promise<
  Result<CastVoteRecordExportMetadata, ReadCastVoteRecordExportMetadataError>
> {
  const metadataFilePath = path.join(
    exportDirectoryPath,
    CastVoteRecordExportFileName.METADATA
  );
  if (!existsSync(metadataFilePath)) {
    return err({ type: 'metadata-file-not-found' });
  }
  const metadataFileContents = await fs.readFile(metadataFilePath, 'utf-8');
  const parseResult = safeParseJson(
    metadataFileContents,
    CastVoteRecordExportMetadataSchema
  );
  if (parseResult.isErr()) {
    return err({ type: 'metadata-file-parse-error' });
  }
  return parseResult;
}

/**
 * Reads and parses a single cast vote record directory (one per-ballot sub-directory of a cast
 * vote record export). Performs basic validation on the cast vote record. Referenced image files
 * and layout files are not read/parsed here; the returned {@link ReferencedFiles} readers verify
 * file hashes when read.
 */
export async function readCastVoteRecordFromDirectory(
  castVoteRecordDirectoryPath: string,
  batchIds: Set<string>
): Promise<Result<CastVoteRecordAndReferencedFiles, ReadCastVoteRecordError>> {
  function wrapError(
    error: Omit<ReadCastVoteRecordError, 'type'>
  ): Result<CastVoteRecordAndReferencedFiles, ReadCastVoteRecordError> {
    return err({ ...error, type: 'invalid-cast-vote-record' });
  }

  const castVoteRecordReportPath = path.join(
    castVoteRecordDirectoryPath,
    CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
  );
  if (!existsSync(castVoteRecordReportPath)) {
    return wrapError({ subType: 'parse-error' });
  }
  const castVoteRecordReportContents = await fs.readFile(
    castVoteRecordReportPath,
    'utf-8'
  );
  const parseResult = safeParseJson(
    castVoteRecordReportContents,
    CastVoteRecordReportWithoutMetadataSchema
  );
  if (parseResult.isErr()) {
    return wrapError({ subType: 'parse-error' });
  }
  const castVoteRecordReport = parseResult.ok();
  if (!castVoteRecordReport.CVR || castVoteRecordReport.CVR.length !== 1) {
    return wrapError({ subType: 'parse-error' });
  }
  const castVoteRecord = assertDefined(castVoteRecordReport.CVR[0]);

  if (!batchIds.has(castVoteRecord.BatchId)) {
    return wrapError({ subType: 'batch-id-not-found' });
  }

  // Only relevant for HMPBs and multi-page BMD ballots
  let castVoteRecordBallotSheetId: number | undefined;
  if (castVoteRecord.BallotSheetId) {
    const parseBallotSheetIdResult = safeParseNumber(
      castVoteRecord.BallotSheetId
    );
    if (parseBallotSheetIdResult.isErr()) {
      return wrapError({ subType: 'invalid-ballot-sheet-id' });
    }
    castVoteRecordBallotSheetId = parseBallotSheetIdResult.ok();
  }

  const castVoteRecordCurrentSnapshot = getCurrentSnapshot(castVoteRecord);
  if (!castVoteRecordCurrentSnapshot) {
    return wrapError({ subType: 'no-current-snapshot' });
  }

  // HMPB has an "interpreted" current snapshot, while BMD (including multi-page) has an "original"
  // current snapshot. Multi-page BMD also has BallotSheetId, so we can't use that alone to
  // identify HMPB.
  const isHandMarkedPaperBallot =
    castVoteRecordCurrentSnapshot.Type === CVR.CVRType.Interpreted;

  let castVoteRecordOriginalSnapshot: CVR.CVRSnapshot | undefined;
  // Original snapshots are used for hmpb mark adjudication
  if (isHandMarkedPaperBallot) {
    castVoteRecordOriginalSnapshot = getOriginalSnapshot(castVoteRecord);
    if (!castVoteRecordOriginalSnapshot) {
      return wrapError({ subType: 'no-original-snapshot' });
    }
  }

  const castVoteRecordWriteIns = getWriteInsFromCastVoteRecord(castVoteRecord);
  if (!castVoteRecordWriteIns.every(isCastVoteRecordWriteInValid)) {
    return wrapError({ subType: 'invalid-write-in-field' });
  }

  let referencedFiles: ReferencedFiles | undefined;
  if (castVoteRecord.BallotImage) {
    if (castVoteRecord.BallotImage.length !== 2) {
      return wrapError({ subType: 'invalid-ballot-image-field' });
    }
    assert(castVoteRecord.BallotImage[0]);
    assert(castVoteRecord.BallotImage[1]);
    if (
      !castVoteRecord.BallotImage[0].Hash?.Value ||
      !castVoteRecord.BallotImage[1].Hash?.Value ||
      !castVoteRecord.BallotImage[0].Location ||
      !castVoteRecord.BallotImage[1].Location ||
      !castVoteRecord.BallotImage[0].Location.startsWith('file:') ||
      !castVoteRecord.BallotImage[1].Location.startsWith('file:')
    ) {
      return wrapError({ subType: 'invalid-ballot-image-field' });
    }
    const imageHashes: SheetOf<string> = [
      getImageHash(castVoteRecord.BallotImage[0]),
      getImageHash(castVoteRecord.BallotImage[1]),
    ];
    const imageRelativePaths: SheetOf<string> = [
      castVoteRecord.BallotImage[0].Location.replace('file:', ''),
      castVoteRecord.BallotImage[1].Location.replace('file:', ''),
    ];
    const imagePaths: SheetOf<string> = mapSheet(
      imageRelativePaths,
      (imageRelativePath) =>
        path.join(castVoteRecordDirectoryPath, imageRelativePath)
    );
    const imageFiles = mapSheet(
      imageHashes,
      imagePaths,
      (expectedFileHash, filePath) =>
        referencedImageFile({ expectedFileHash, filePath })
    );

    const layoutFileHash1 = getLayoutHash(castVoteRecord.BallotImage[0]);
    const layoutFileHash2 = getLayoutHash(castVoteRecord.BallotImage[1]);
    let layoutFiles: SheetOf<ReferencedFile<BallotPageLayout>> | undefined;
    if (isHandMarkedPaperBallot) {
      if (!layoutFileHash1 || !layoutFileHash2) {
        return wrapError({ subType: 'invalid-ballot-image-field' });
      }
      const layoutFileHashes: SheetOf<string> = [
        layoutFileHash1,
        layoutFileHash2,
      ];
      const layoutFilePaths: SheetOf<string> = mapSheet(
        imagePaths,
        (imagePath) => {
          const { dir, name } = path.parse(imagePath);
          return path.join(dir, `${name}.layout.json`);
        }
      );
      layoutFiles = mapSheet(
        layoutFileHashes,
        layoutFilePaths,
        (expectedFileHash, filePath) =>
          referencedLayoutFile({ expectedFileHash, filePath })
      );
    }

    referencedFiles = { imageFiles, layoutFiles };
  }

  return ok({
    castVoteRecord,
    castVoteRecordBallotSheetId,
    castVoteRecordCurrentSnapshot,
    castVoteRecordOriginalSnapshot,
    castVoteRecordWriteIns,
    referencedFiles,
  });
}

async function* castVoteRecordGenerator(
  exportDirectoryPath: string,
  batchIds: Set<string>
): AsyncGenerator<
  Result<CastVoteRecordAndReferencedFiles, ReadCastVoteRecordError>
> {
  const castVoteRecordIds =
    await getExportedCastVoteRecordIds(exportDirectoryPath);
  for (const castVoteRecordId of castVoteRecordIds) {
    const result = await readCastVoteRecordFromDirectory(
      path.join(exportDirectoryPath, castVoteRecordId),
      batchIds
    );
    yield result;
    if (result.isErr()) {
      return;
    }
  }
}

/**
 * Reads and parses a cast vote record export, authenticating the export in the process. The
 * export's metadata file is parsed upfront whereas the cast vote records are parsed lazily.
 *
 * Basic validation is performed on the cast vote records. Referenced image files and layout files
 * are not read/parsed, but their existence is validated such that consumers can safely access
 * them.
 */
export async function readCastVoteRecordExport(
  exportDirectoryPath: string
): Promise<
  Result<CastVoteRecordExportContents, ReadCastVoteRecordExportError>
> {
  const authenticationResult: Result<void, Error> = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  )
    ? ok()
    : await authenticateArtifactUsingSignatureFile({
        type: 'cast_vote_records',
        context: 'import',
        directoryPath: exportDirectoryPath,
      });
  if (authenticationResult.isErr()) {
    return err({
      type: 'authentication-error',
      details: authenticationResult.err().message,
    });
  }

  const metadataResult =
    await readCastVoteRecordExportMetadata(exportDirectoryPath);
  if (metadataResult.isErr()) {
    return metadataResult;
  }
  const castVoteRecordExportMetadata = metadataResult.ok();

  const batchIds = new Set(
    castVoteRecordExportMetadata.batchManifest.map((batch) => batch.id)
  );
  const castVoteRecordIterator = iter(
    castVoteRecordGenerator(exportDirectoryPath, batchIds)
  );

  return ok({
    castVoteRecordExportMetadata,
    castVoteRecordIterator,
  });
}

/**
 * Determines whether or not a cast vote record report was generated on a machine in test mode
 */
export function isTestReport(
  castVoteRecordReport: Omit<CVR.CastVoteRecordReport, 'CVR'>
): boolean {
  const containsOtherReportType = Boolean(
    castVoteRecordReport.ReportType?.some(
      (reportType) => reportType === CVR.ReportType.Other
    )
  );
  const otherReportTypeContainsTest = Boolean(
    castVoteRecordReport.OtherReportType?.split(',').includes(
      TEST_OTHER_REPORT_TYPE
    )
  );
  return containsOtherReportType && otherReportTypeContainsTest;
}
