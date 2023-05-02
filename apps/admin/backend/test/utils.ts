import {
  CastVoteRecordReportImport,
  getCastVoteRecordReportImport,
} from '@votingworks/backend';
import { CandidateContest } from '@votingworks/types';
import { pipeline } from 'stream/promises';
import {
  CAST_VOTE_RECORD_REPORT_FILENAME,
  jsonStream,
} from '@votingworks/utils';
import * as fs from 'fs';
import { join } from 'path';
import { WriteInAdjudicationTableOptionGroup } from '../src';

/**
 * Builds the group of options for adjudicating write-ins to official candidates
 * for a given contest, useful for testing the adjudication table results.
 */
export function buildOfficialCandidatesWriteInAdjudicationOptionGroup(
  contest: CandidateContest
): WriteInAdjudicationTableOptionGroup {
  return {
    title: 'Official Candidates',
    options: contest.candidates
      .map((candidate) => ({
        adjudicatedValue: candidate.name,
        adjudicatedOptionId: candidate.id,
        enabled: true,
      }))
      .sort((a, b) => a.adjudicatedValue.localeCompare(b.adjudicatedValue)),
  };
}

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
