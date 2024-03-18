import { Admin, Tabulation } from '@votingworks/types';
import React from 'react';
import { combineGroupSpecifierAndFilter } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { AdminTallyReportByParty } from '@votingworks/ui';
import { Buffer } from 'buffer';
import { LogEventId, Logger } from '@votingworks/logging';
import { Printer, renderToPdf } from '@votingworks/printing';
import { generateTitleForReport } from './titles';
import { Store } from '../store';
import { getCurrentTime } from '../util/get_current_time';
import { TallyReportWarning, getTallyReportWarning } from './warnings';
import { exportFile } from '../util/export_file';
import { ExportDataResult } from '../types';

/**
 * Parameters that define a tally report.
 */
export interface TallyReportSpec {
  filter: Admin.FrontendReportingFilter;
  groupBy: Tabulation.GroupBy;
  includeSignatureLines: boolean;
}

const CUSTOM_FILTER_REPORT_TITLE = 'Custom Filter Tally Report';

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
  const { electionDefinition, isOfficialResults } = electionRecord;
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
    });
    const { title, displayedFilter } = titleGeneration.isOk()
      ? {
          title: titleGeneration.ok(),
          displayedFilter: undefined,
        }
      : {
          title: CUSTOM_FILTER_REPORT_TITLE,
          displayedFilter: subReportFilter,
        };

    allReports.push(
      React.createElement(AdminTallyReportByParty, {
        electionDefinition,
        testId: 'tally-report',
        key: `tally-report-${index}`,
        title,
        tallyReportResults,
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
  pdf: Buffer;
  warning: TallyReportWarning;
}

/**
 * Returns a PDF preview of the tally report, as a buffer, along with
 * any report warnings that should be displayed to the user.
 */
export async function generateTallyReportPreview({
  logger,

  ...reportProps
}: TallyReportPreviewProps): Promise<TallyReportPreview> {
  const report = buildTallyReport(reportProps);
  const electionId = reportProps.store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = reportProps.store.getElection(electionId);
  assert(electionRecord);
  const {
    electionDefinition: { election },
  } = electionRecord;
  await logger.logAsCurrentRole(LogEventId.ElectionReportPreviewed, {
    message: `User previewed a tally report.`,
    disposition: 'success',
  });
  return {
    pdf: await renderToPdf({ document: report }),
    warning: getTallyReportWarning({
      allTallyReports: reportProps.allTallyReportResults,
      election,
    }),
  };
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
    await printer.print({ data: await renderToPdf({ document: report }) });
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
  path,
  logger,

  ...reportProps
}: TallyReportPreviewProps & {
  path: string;
}): Promise<ExportDataResult> {
  const report = buildTallyReport(reportProps);
  const exportFileResult = await exportFile({
    path,
    data: await renderToPdf({ document: report }),
  });

  await logger.logAsCurrentRole(LogEventId.FileSaved, {
    disposition: exportFileResult.isOk() ? 'success' : 'failure',
    message: `${
      exportFileResult.isOk() ? 'Saved' : 'Failed to save'
    } tally report PDF file to ${path} on the USB drive.`,
    filename: path,
  });

  return exportFileResult;
}
