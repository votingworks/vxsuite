import { Admin, Tabulation } from '@votingworks/types';
import React from 'react';
import { combineGroupSpecifierAndFilter } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { AdminTallyReportByParty } from '@votingworks/ui';

import { LogEventId, Logger } from '@votingworks/logging';
import { Printer, renderToPdf } from '@votingworks/printing';
import { UsbDrive } from '@votingworks/usb-drive';
import { join } from 'node:path';
import { generateTitleForReport } from './titles';
import { Store } from '../store';
import { getCurrentTime } from '../util/get_current_time';
import { TallyReportWarning, getTallyReportWarning } from './warnings';
import { ExportDataResult } from '../types';
import { generateReportsDirectoryPath } from '../util/filenames';
import { buildExporter } from '../util/exporter';

/**
 * Parameters that define a tally report.
 */
export interface TallyReportSpec {
  filter: Admin.FrontendReportingFilter;
  groupBy: Tabulation.GroupBy;
  includeSignatureLines: boolean;
}

function buildTallyReport({
  store,
  allTallyReportResults,
  filter,
  includeSignatureLines,
}: TallyReportSpec & {
  store: Store;
  allTallyReportResults: Tabulation.GroupList<Admin.TallyReportResults>;
}): JSX.Element {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const { electionDefinition, electionPackageHash, isOfficialResults } =
    electionRecord;
  const isTest = store.getCurrentCvrFileModeForElection(electionId) === 'test';
  const scannerBatches = store.getScannerBatches(electionId);

  const allReports: JSX.Element[] = [];

  for (const [index, tallyReportResults] of allTallyReportResults.entries()) {
    // A tally report may be split into separate sub-reports due to the group
    // by clause or, for a primary, by party. The `subReportFilter` is the filter
    // for an individual sub-report, which combines the overall filter and the
    // filter implied by the sub-report's group.
    const subReportFilter = combineGroupSpecifierAndFilter(
      tallyReportResults,
      filter
    );
    const titleGeneration = generateTitleForReport({
      filter: subReportFilter,
      electionDefinition,
      scannerBatches,
      reportType: 'Tally',
    });
    const { title, displayedFilter } = titleGeneration.isOk()
      ? {
          title: titleGeneration.ok(),
          displayedFilter: undefined,
        }
      : {
          title: 'Custom Filter Tally Report',
          displayedFilter: subReportFilter,
        };

    allReports.push(
      React.createElement(AdminTallyReportByParty, {
        electionDefinition,
        electionPackageHash,
        testId: 'tally-report',
        key: `tally-report-${index}`,
        title,
        tallyReportResults,
        scannerBatches,
        isOfficial: isOfficialResults,
        isTest,
        customFilter: displayedFilter,
        includeSignatureLines,
        generatedAtTime: new Date(getCurrentTime()),
      })
    );
  }

  return React.createElement(React.Fragment, {}, allReports);
}

type TallyReportPreviewProps = TallyReportSpec & {
  store: Store;
  allTallyReportResults: Tabulation.GroupList<Admin.TallyReportResults>;
  logger: Logger;
};

/**
 * PDF data for a tally report alongside any potential warnings.
 */
export interface TallyReportPreview {
  pdf?: Uint8Array;
  warning?: TallyReportWarning;
}

/**
 * Returns a PDF preview of the tally report, as a buffer, along with
 * any report warnings that should be displayed to the user.
 */
export async function generateTallyReportPreview({
  logger,

  ...reportProps
}: TallyReportPreviewProps): Promise<TallyReportPreview> {
  const result = await (async () => {
    const electionId = reportProps.store.getCurrentElectionId();
    assert(electionId !== undefined);
    const electionRecord = reportProps.store.getElection(electionId);
    assert(electionRecord);
    const {
      electionDefinition: { election },
    } = electionRecord;
    const warning = getTallyReportWarning({
      allTallyReports: reportProps.allTallyReportResults,
      election,
    });
    if (warning?.type === 'no-reports-match-filter') {
      return { warning };
    }
    const report = buildTallyReport(reportProps);
    const pdfResult = await renderToPdf({ document: report });
    return {
      pdf: pdfResult.ok(),
      warning: pdfResult.isErr() ? { type: pdfResult.err() } : warning,
    };
  })();
  await logger.logAsCurrentRole(LogEventId.ElectionReportPreviewed, {
    message: `User previewed a tally report.${
      result.warning ? ` Warning: ${result.warning.type}` : ''
    }`,
    disposition: result.pdf ? 'success' : 'failure',
  });
  return result;
}

/**
 * Generates the tally report, sends it to the printer, and
 * logs success or failure.
 */
export async function printTallyReport({
  printer,
  logger,

  ...reportProps
}: TallyReportPreviewProps & {
  printer: Printer;
}): Promise<void> {
  const report = buildTallyReport(reportProps);

  try {
    // Printing is disabled on the frontend if the report preview is too large,
    // so rendering the PDF shouldn't error
    const data = (await renderToPdf({ document: report })).unsafeUnwrap();
    await printer.print({ data });
    await logger.logAsCurrentRole(LogEventId.ElectionReportPrinted, {
      message: `User printed a tally report.`,
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.logAsCurrentRole(LogEventId.ElectionReportPrinted, {
      message: `Error in attempting to print tally report: ${error.message}`,
      disposition: 'failure',
    });
  }
}

/**
 * Generates the tally report and exports it as a PDF file on
 * the USB drive.
 */
export async function exportTallyReportPdf({
  filename,
  usbDrive,
  logger,
  ...reportProps
}: TallyReportPreviewProps & {
  filename: string;
  usbDrive: UsbDrive;
}): Promise<ExportDataResult> {
  const report = buildTallyReport(reportProps);
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
    } tally report PDF file to ${reportPath} on the USB drive.`,
    path: reportPath,
  });

  return exportFileResult;
}
