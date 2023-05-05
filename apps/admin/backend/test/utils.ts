import {
  CastVoteRecordReportImport,
  getCastVoteRecordReportImport,
} from '@votingworks/backend';
import { pipeline } from 'stream/promises';
import {
  CAST_VOTE_RECORD_REPORT_FILENAME,
  jsonStream,
} from '@votingworks/utils';
import * as fs from 'fs';
import { join } from 'path';

/**
 * Allows modifying a cast vote record report fixture. Does not touch the
 * ballot images or layouts.
 */
export async function modifyCastVoteRecordReport(
  reportDirectoryPath: string,
  modifyCallback: (
    initialReport: CastVoteRecordReportImport
  ) => Partial<CastVoteRecordReportImport>
): Promise<string> {
  const reportPath = join(
    reportDirectoryPath,
    CAST_VOTE_RECORD_REPORT_FILENAME
  );
  const tmpReportPath = `${reportPath}-tmp`;
  fs.renameSync(reportPath, tmpReportPath);
  const originalCastVoteRecordImport = (
    await getCastVoteRecordReportImport(tmpReportPath)
  ).assertOk('fixture and path to fixture should be valid');

  const newCastVoteRecordImport: CastVoteRecordReportImport = {
    ...originalCastVoteRecordImport,
    ...modifyCallback(originalCastVoteRecordImport),
  };

  await pipeline(
    jsonStream(newCastVoteRecordImport),
    fs.createWriteStream(reportPath)
  );
  fs.rmSync(tmpReportPath);

  return reportDirectoryPath;
}
