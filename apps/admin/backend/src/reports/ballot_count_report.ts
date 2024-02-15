import { assert } from '@votingworks/basics';
import { BallotCountReport } from '@votingworks/ui';
import { Admin, Tabulation } from '@votingworks/types';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { Buffer } from 'buffer';
import { Printer, renderToPdf } from '@votingworks/printing';
import { Store } from '../store';
import { generateTitleForReport } from './titles';
import { getCurrentTime } from '../util/get_current_time';
import { ExportDataResult } from '../types';
import { exportFile } from '../util/export_file';
import {
  BallotCountReportWarning,
  getBallotCountReportWarning,
} from './warnings';

/**
 * Parameters that define a ballot count report.
 */
export interface BallotCountReportSpec {
  filter: Admin.FrontendReportingFilter;
  groupBy: Tabulation.GroupBy;
  includeSheetCounts: boolean;
}

function buildBallotCountReport({
  store,
  allCardCounts,
  filter,
  groupBy,
  includeSheetCounts,
}: BallotCountReportSpec & {
  store: Store;
  allCardCounts: Tabulation.GroupList<Tabulation.CardCounts>;
}): JSX.Element {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const { electionDefinition, isOfficialResults } = electionRecord;
  const isTest = store.getCurrentCvrFileModeForElection(electionId) === 'test';
  const scannerBatches = store.getScannerBatches(electionId);
  const titleGeneration = generateTitleForReport({
    filter,
    electionDefinition,
    scannerBatches,
    reportType: 'Ballot Count',
  });
  const title = titleGeneration.isOk()
    ? titleGeneration.ok() ?? `Full Election Ballot Count Report`
    : 'Custom Filter Ballot Count Report';
  const customFilter = !titleGeneration.isOk() ? filter : undefined;

  return BallotCountReport({
    title,
    isOfficial: isOfficialResults,
    isTest,
    electionDefinition,
    customFilter,
    scannerBatches,
    generatedAtTime: new Date(getCurrentTime()),
    groupBy,
    includeSheetCounts,
    cardCountsList: allCardCounts,
  });
}

type BallotCountReportPreviewProps = BallotCountReportSpec & {
  store: Store;
  allCardCounts: Tabulation.GroupList<Tabulation.CardCounts>;
  logger: Logger;
  userRole: LoggingUserRole;
};

/**
 * PDF data for a ballot count report alongside any potential warnings.
 */
export interface BallotCountReportPreview {
  pdf: Buffer;
  warning: BallotCountReportWarning;
}

/**
 * Returns a PDF preview of the ballot count report, as a buffer, along with
 * any report warnings that should be displayed to the user.
 */
export async function generateBallotCountReportPreview({
  logger,
  userRole,
  ...reportProps
}: BallotCountReportPreviewProps): Promise<BallotCountReportPreview> {
  const report = buildBallotCountReport(reportProps);
  await logger.log(LogEventId.ElectionReportPreviewed, userRole, {
    message: `User previewed a ballot count report.`,
    disposition: 'success',
  });
  return {
    pdf: await renderToPdf(report),
    warning: getBallotCountReportWarning(reportProps),
  };
}

/**
 * Generates the ballot count report, sends it to the printer, and
 * logs success or failure.
 */
export async function printBallotCountReport({
  printer,
  logger,
  userRole,
  ...reportProps
}: BallotCountReportPreviewProps & {
  printer: Printer;
}): Promise<void> {
  const report = buildBallotCountReport(reportProps);

  try {
    await printer.print({ data: await renderToPdf(report) });
    await logger.log(LogEventId.ElectionReportPrinted, userRole, {
      message: `User printed a ballot count report.`,
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.log(LogEventId.ElectionReportPrinted, userRole, {
      message: `Error in attempting to print ballot count report: ${error.message}`,
      disposition: 'failure',
    });
  }
}

/**
 * Generates the ballot count report and exports it as a PDF file on
 * the USB drive.
 */
export async function exportBallotCountReportPdf({
  path,
  logger,
  userRole,
  ...reportProps
}: BallotCountReportPreviewProps & {
  path: string;
}): Promise<ExportDataResult> {
  const report = buildBallotCountReport(reportProps);
  const exportFileResult = await exportFile({
    path,
    data: await renderToPdf(report),
  });

  await logger.log(LogEventId.FileSaved, userRole, {
    disposition: exportFileResult.isOk() ? 'success' : 'failure',
    message: `${
      exportFileResult.isOk() ? 'Saved' : 'Failed to save'
    } ballot count report PDF file to ${path} on the USB drive.`,
    filename: path,
  });

  return exportFileResult;
}
