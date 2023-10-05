/* istanbul ignore file */
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { authenticateArtifactUsingSignatureFile } from '@votingworks/auth';
import {
  assertDefined,
  AsyncIteratorPlus,
  err,
  iter,
  ok,
  Result,
} from '@votingworks/basics';
import {
  CastVoteRecordExportFileName,
  CastVoteRecordExportMetadata,
  CastVoteRecordExportMetadataSchema,
  CVR,
  safeParseJson,
  safeParseNumber,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  CastVoteRecordWriteIn,
  getCurrentSnapshot,
  getExportedCastVoteRecordIds,
  getWriteInsFromCastVoteRecord,
  isCastVoteRecordWriteInValid,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

import { TEST_OTHER_REPORT_TYPE } from './build_report_metadata';

/**
 * A cast vote record report without metadata
 */
export type CastVoteRecordReportWithoutMetadata = Pick<
  CVR.CastVoteRecordReport,
  'CVR'
>;

const CastVoteRecordReportWithoutMetadataSchema: z.ZodSchema<CastVoteRecordReportWithoutMetadata> =
  z.object({
    CVR: z.array(CVR.CVRSchema),
  });

type ReadCastVoteRecordExportMetadataError =
  | { type: 'metadata-file-not-found' }
  | { type: 'metadata-file-parse-error' };

/**
 * An error encountered while reading an individual cast vote record
 */
export type ReadCastVoteRecordError = { type: 'invalid-cast-vote-record' } & (
  | { subType: 'batch-id-not-found' }
  | { subType: 'image-file-not-found' }
  | { subType: 'invalid-ballot-image-field' }
  | { subType: 'invalid-ballot-sheet-id' }
  | { subType: 'invalid-write-in-field' }
  | { subType: 'layout-file-not-found' }
  | { subType: 'no-current-snapshot' }
  | { subType: 'parse-error' }
);

/**
 * A top-level error encountered while reading a cast vote record export. Does not include errors
 * encountered while reading individual cast vote records.
 */
export type ReadCastVoteRecordExportError =
  | ReadCastVoteRecordExportMetadataError
  | { type: 'authentication-error' };

interface ReferencedFiles {
  imageFilePaths: [string, string]; // [front, back]
  layoutFilePaths?: [string, string]; // [front, back]
}

interface CastVoteRecordAndReferencedFiles {
  castVoteRecord: CVR.CVR;
  castVoteRecordBallotSheetId?: number;
  castVoteRecordCurrentSnapshot: CVR.CVRSnapshot;
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

async function* castVoteRecordGenerator(
  exportDirectoryPath: string,
  batchIds: Set<string>
): AsyncGenerator<
  Result<CastVoteRecordAndReferencedFiles, ReadCastVoteRecordError>
> {
  function wrapError(
    error: Omit<ReadCastVoteRecordError, 'type'>
  ): Result<CastVoteRecordAndReferencedFiles, ReadCastVoteRecordError> {
    return err({ ...error, type: 'invalid-cast-vote-record' });
  }

  const castVoteRecordIds =
    await getExportedCastVoteRecordIds(exportDirectoryPath);
  for (const castVoteRecordId of castVoteRecordIds) {
    const castVoteRecordDirectoryPath = path.join(
      exportDirectoryPath,
      castVoteRecordId
    );
    const castVoteRecordReportContents = await fs.readFile(
      path.join(
        castVoteRecordDirectoryPath,
        CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
      ),
      'utf-8'
    );
    const parseResult = safeParseJson(
      castVoteRecordReportContents,
      CastVoteRecordReportWithoutMetadataSchema
    );
    if (parseResult.isErr()) {
      yield wrapError({ subType: 'parse-error' });
      return;
    }
    const castVoteRecordReport = parseResult.ok();
    if (castVoteRecordReport.CVR?.length !== 1) {
      yield wrapError({ subType: 'parse-error' });
      return;
    }
    const castVoteRecord = assertDefined(castVoteRecordReport.CVR[0]);

    if (!batchIds.has(castVoteRecord.BatchId)) {
      yield wrapError({ subType: 'batch-id-not-found' });
      return;
    }

    // Only relevant for HMPBs
    let castVoteRecordBallotSheetId: number | undefined;
    const isHandMarkedPaperBallot = Boolean(castVoteRecord.BallotSheetId);
    if (castVoteRecord.BallotSheetId) {
      const parseBallotSheetIdResult = safeParseNumber(
        castVoteRecord.BallotSheetId
      );
      if (parseBallotSheetIdResult.isErr()) {
        yield wrapError({ subType: 'invalid-ballot-sheet-id' });
        return;
      }
      castVoteRecordBallotSheetId = parseBallotSheetIdResult.ok();
    }

    const castVoteRecordCurrentSnapshot = getCurrentSnapshot(castVoteRecord);
    if (!castVoteRecordCurrentSnapshot) {
      yield wrapError({ subType: 'no-current-snapshot' });
      return;
    }

    const castVoteRecordWriteIns =
      getWriteInsFromCastVoteRecord(castVoteRecord);
    if (!castVoteRecordWriteIns.every(isCastVoteRecordWriteInValid)) {
      yield wrapError({ subType: 'invalid-write-in-field' });
      return;
    }

    let referencedFiles: ReferencedFiles | undefined;
    if (castVoteRecord.BallotImage) {
      if (
        castVoteRecord.BallotImage.length !== 2 ||
        !castVoteRecord.BallotImage[0]?.Location?.startsWith('file:') ||
        !castVoteRecord.BallotImage[1]?.Location?.startsWith('file:')
      ) {
        yield wrapError({ subType: 'invalid-ballot-image-field' });
        return;
      }
      const ballotImageLocations: [string, string] = [
        castVoteRecord.BallotImage[0].Location.replace('file:', ''),
        castVoteRecord.BallotImage[1].Location.replace('file:', ''),
      ];

      const imageFilePaths = ballotImageLocations.map((location) =>
        path.join(castVoteRecordDirectoryPath, location)
      ) as [string, string];
      const layoutFilePaths = isHandMarkedPaperBallot
        ? (ballotImageLocations.map((location) =>
            path.join(
              castVoteRecordDirectoryPath,
              `${path.parse(location).name}.layout.json`
            )
          ) as [string, string])
        : undefined;

      if (!imageFilePaths.every((filePath) => existsSync(filePath))) {
        yield wrapError({ subType: 'image-file-not-found' });
        return;
      }
      if (
        layoutFilePaths &&
        !layoutFilePaths.every((filePath) => existsSync(filePath))
      ) {
        yield wrapError({ subType: 'layout-file-not-found' });
        return;
      }

      referencedFiles = { imageFilePaths, layoutFilePaths };
    }

    yield ok({
      castVoteRecord,
      castVoteRecordBallotSheetId,
      castVoteRecordCurrentSnapshot,
      castVoteRecordWriteIns,
      referencedFiles,
    });
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
  const authenticationResult = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  )
    ? ok()
    : await authenticateArtifactUsingSignatureFile({
        type: 'cast_vote_records',
        context: 'import',
        directoryPath: exportDirectoryPath,
      });
  if (authenticationResult.isErr()) {
    return err({ type: 'authentication-error' });
  }

  const metadataResult =
    await readCastVoteRecordExportMetadata(exportDirectoryPath);
  if (metadataResult.isErr()) {
    return metadataResult;
  }
  const castVoteRecordExportMetadata = metadataResult.ok();

  const batchIds = new Set(
    castVoteRecordExportMetadata.castVoteRecordReportMetadata.vxBatch.map(
      (batch) => batch['@id']
    )
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
