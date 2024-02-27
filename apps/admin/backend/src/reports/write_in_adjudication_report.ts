import { assert } from '@votingworks/basics';
import { WriteInAdjudicationReport } from '@votingworks/ui';
import { Printer, renderToPdf } from '@votingworks/printing';
import { Buffer } from 'buffer';
import { LogEventId, Logger } from '@votingworks/logging';
import { Tabulation } from '@votingworks/types';
import { Store } from '../store';
import { getCurrentTime } from '../util/get_current_time';
import { exportFile } from '../util/export_file';
import { ExportDataResult } from '../types';

function buildWriteInAdjudicationReport({
  store,
  electionWriteInSummary,
}: {
  store: Store;
  electionWriteInSummary: Tabulation.ElectionWriteInSummary;
}): JSX.Element {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const {
    electionDefinition: { election },
    isOfficialResults,
  } = electionRecord;
  const isTest = store.getCurrentCvrFileModeForElection(electionId) === 'test';

  return WriteInAdjudicationReport({
    election,
    isOfficial: isOfficialResults,
    isTest,
    generatedAtTime: new Date(getCurrentTime()),
    electionWriteInSummary,
  });
}

interface WriteInAdjudicationReportPreviewProps {
  store: Store;
  electionWriteInSummary: Tabulation.ElectionWriteInSummary;
  logger: Logger;
}

/**
 * Returns a PDF preview of the write-in adjudication report, as a buffer.
 */
export async function generateWriteInAdjudicationReportPreview({
  logger,

  ...reportProps
}: WriteInAdjudicationReportPreviewProps): Promise<Buffer> {
  const report = buildWriteInAdjudicationReport(reportProps);
  await logger.logAsCurrentUser(LogEventId.ElectionReportPreviewed, {
    message: `User previewed the write-in adjudication report.`,
    disposition: 'success',
  });
  return renderToPdf(report);
}

/**
 * Generates the write-in adjudication report, sends it to the printer, and
 * logs success or failure.
 */
export async function printWriteInAdjudicationReport({
  printer,
  logger,

  ...reportProps
}: WriteInAdjudicationReportPreviewProps & {
  printer: Printer;
}): Promise<void> {
  const report = buildWriteInAdjudicationReport(reportProps);

  try {
    await printer.print({ data: await renderToPdf(report) });
    await logger.logAsCurrentUser(LogEventId.ElectionReportPrinted, {
      message: `User printed the write-in adjudication report.`,
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.logAsCurrentUser(LogEventId.ElectionReportPrinted, {
      message: `Error in attempting to print the write-in adjudication report: ${error.message}`,
      disposition: 'failure',
    });
  }
}

/**
 * Generates the write-in adjudication report and exports it as a PDF file on
 * the USB drive.
 */
export async function exportWriteInAdjudicationReportPdf({
  path,
  logger,

  ...reportProps
}: WriteInAdjudicationReportPreviewProps & {
  path: string;
}): Promise<ExportDataResult> {
  const report = buildWriteInAdjudicationReport(reportProps);
  const exportFileResult = await exportFile({
    path,
    data: await renderToPdf(report),
  });

  await logger.logAsCurrentUser(LogEventId.FileSaved, {
    disposition: exportFileResult.isOk() ? 'success' : 'failure',
    message: `${
      exportFileResult.isOk() ? 'Saved' : 'Failed to save'
    } write-in adjudication report PDF file to ${path} on the USB drive.`,
    filename: path,
  });

  return exportFileResult;
}
