import { assert } from '@votingworks/basics';
import { BallotCountReport } from '@votingworks/ui';
import { Admin, Tabulation } from '@votingworks/types';
import { LogEventId, Logger } from '@votingworks/logging';

import { Printer, renderToPdf } from '@votingworks/printing';
import { UsbDrive } from '@votingworks/usb-drive';
import { join } from 'node:path';
import { Store } from '../store';
import { generateTitleForReport } from './titles';
import { getCurrentTime } from '../util/get_current_time';
import { ExportDataResult } from '../types';
import {
  BallotCountReportWarning,
  getBallotCountReportWarning,
} from './warnings';
import { generateReportsDirectoryPath } from '../util/filenames';
import { buildExporter } from '../util/exporter';

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
  const { electionDefinition, electionPackageHash, isOfficialResults } =
    electionRecord;
  const isTest = store.getCurrentCvrFileModeForElection(electionId) === 'test';
  const scannerBatches = store.getScannerBatches(electionId);
  const titleGeneration = generateTitleForReport({
    filter,
    electionDefinition,
    scannerBatches,
    reportType: 'Ballot Count',
  });
  const { title, displayedFilter } = titleGeneration.isOk()
    ? {
        title: titleGeneration.ok(),
        displayedFilter: undefined,
      }
    : {
        title: 'Custom Filter Ballot Count Report',
        displayedFilter: filter,
      };

  return BallotCountReport({
    title,
    isOfficial: isOfficialResults,
    isTest,
    electionDefinition,
    electionPackageHash,
    customFilter: displayedFilter,
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
};

/**
 * PDF data for a ballot count report alongside any potential warnings.
 */
export interface BallotCountReportPreview {
  pdf?: Uint8Array;
  warning?: BallotCountReportWarning;
}

/**
 * Returns a PDF preview of the ballot count report, as a buffer, along with
 * any report warnings that should be displayed to the user.
 */
export async function generateBallotCountReportPreview({
  logger,

  ...reportProps
}: BallotCountReportPreviewProps): Promise<BallotCountReportPreview> {
  const result = await (async () => {
    const warning = getBallotCountReportWarning(reportProps);
    if (warning?.type === 'no-reports-match-filter') {
      return { warning };
    }
    const report = buildBallotCountReport(reportProps);
    const pdf = await renderToPdf({ document: report });
    return {
      pdf: pdf.ok(),
      warning: pdf.isErr() ? { type: pdf.err() } : warning,
    };
  })();
  await logger.logAsCurrentRole(LogEventId.ElectionReportPreviewed, {
    message: `User previewed a ballot count report.${
      result.warning ? ` Warning: ${result.warning.type}` : ''
    }`,
    disposition: result.pdf ? 'success' : 'failure',
  });
  return result;
}

/**
 * Generates the ballot count report, sends it to the printer, and
 * logs success or failure.
 */
export async function printBallotCountReport({
  printer,
  logger,

  ...reportProps
}: BallotCountReportPreviewProps & {
  printer: Printer;
}): Promise<void> {
  const report = buildBallotCountReport(reportProps);

  try {
    // Printing is disabled on the frontend if the report preview is too large,
    // so rendering the PDF shouldn't error
    const data = (await renderToPdf({ document: report })).unsafeUnwrap();
    await printer.print({ data });
    await logger.logAsCurrentRole(LogEventId.ElectionReportPrinted, {
      message: `User printed a ballot count report.`,
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.logAsCurrentRole(LogEventId.ElectionReportPrinted, {
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
  filename,
  usbDrive,
  logger,
  ...reportProps
}: BallotCountReportPreviewProps & {
  filename: string;
  usbDrive: UsbDrive;
}): Promise<ExportDataResult> {
  const report = buildBallotCountReport(reportProps);
  // Printing is disabled on the frontend if the report preview is too large,
  // so rendering the PDF shouldn't error
  const data = (await renderToPdf({ document: report })).unsafeUnwrap();

  const { store } = reportProps;
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const { electionDefinition } = electionRecord;
  const reportsDirectoryPath = generateReportsDirectoryPath(electionDefinition);

  const exporter = buildExporter(usbDrive);
  const exportFileResult = await exporter.exportDataToUsbDrive(
    reportsDirectoryPath,
    filename,
    data
  );

  const reportPath = join(reportsDirectoryPath, filename);
  await logger.logAsCurrentRole(LogEventId.FileSaved, {
    disposition: exportFileResult.isOk() ? 'success' : 'failure',
    message: `${
      exportFileResult.isOk() ? 'Saved' : 'Failed to save'
    } ballot count report PDF file to ${reportPath} on the USB drive.`,
    path: reportPath,
  });

  return exportFileResult;
}
