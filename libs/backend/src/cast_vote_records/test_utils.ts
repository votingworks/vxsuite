/* istanbul ignore file */
import fs from 'fs';
import path from 'path';
import { computeCastVoteRecordRootHashFromScratch } from '@votingworks/auth';
import { assertDefined } from '@votingworks/basics';
import {
  CastVoteRecordExportFileName,
  CVR,
  safeParseJson,
} from '@votingworks/types';
import { getExportedCastVoteRecordIds } from '@votingworks/utils';

import { readCastVoteRecordExportMetadata } from './import';

function identifyFunction<T>(input: T): T {
  return input;
}

/**
 * Modifies a cast vote record export. Specifically meant for modifying fixtures for tests.
 */
export async function modifyCastVoteRecordExport(
  exportDirectoryPath: string,
  modifications: {
    castVoteRecordModifier?: (castVoteRecord: CVR.CVR) => CVR.CVR;
    castVoteRecordReportMetadataModifier?: (
      castVoteRecordReportMetadata: CVR.CastVoteRecordReport
    ) => CVR.CastVoteRecordReport;
    numCastVoteRecordsToKeep?: number;
  }
): Promise<string> {
  const {
    castVoteRecordModifier = identifyFunction,
    castVoteRecordReportMetadataModifier = identifyFunction,
    numCastVoteRecordsToKeep,
  } = modifications;

  const modifiedExportDirectoryPath = `${exportDirectoryPath}-modified`;
  fs.cpSync(exportDirectoryPath, modifiedExportDirectoryPath, {
    recursive: true,
  });

  const castVoteRecordIds = await getExportedCastVoteRecordIds(
    modifiedExportDirectoryPath
  );
  for (const [i, castVoteRecordId] of [...castVoteRecordIds].sort().entries()) {
    const castVoteRecordDirectoryPath = path.join(
      modifiedExportDirectoryPath,
      castVoteRecordId
    );
    if (
      numCastVoteRecordsToKeep !== undefined &&
      i >= numCastVoteRecordsToKeep
    ) {
      fs.rmSync(castVoteRecordDirectoryPath, { recursive: true });
      continue;
    }

    const castVoteRecordReportPath = path.join(
      castVoteRecordDirectoryPath,
      CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
    );
    const castVoteRecordReport = safeParseJson(
      fs.readFileSync(castVoteRecordReportPath, 'utf-8'),
      CVR.CastVoteRecordReportSchema
    ).unsafeUnwrap();
    const castVoteRecord = assertDefined(castVoteRecordReport.CVR?.[0]);
    fs.writeFileSync(
      path.join(
        castVoteRecordDirectoryPath,
        CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
      ),
      JSON.stringify({
        ...castVoteRecordReport,
        CVR: [castVoteRecordModifier(castVoteRecord)],
      })
    );
  }

  const metadata = (
    await readCastVoteRecordExportMetadata(modifiedExportDirectoryPath)
  ).unsafeUnwrap();
  fs.writeFileSync(
    path.join(
      modifiedExportDirectoryPath,
      CastVoteRecordExportFileName.METADATA
    ),
    JSON.stringify({
      ...metadata,
      castVoteRecordReportMetadata: castVoteRecordReportMetadataModifier(
        metadata.castVoteRecordReportMetadata
      ),
      castVoteRecordRootHash: await computeCastVoteRecordRootHashFromScratch(
        modifiedExportDirectoryPath
      ),
    })
  );

  return modifiedExportDirectoryPath;
}
