import { assert } from '@votingworks/basics';
import { VoterTurnoutReport } from '@votingworks/ui';
import { PdfError, Printer, renderToPdf } from '@votingworks/printing';
import { LogEventId, Logger } from '@votingworks/logging';
import { Tabulation } from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import { join } from 'node:path';
import { Store } from '../store';
import { getCurrentTime } from '../util/get_current_time';
import { ExportDataResult } from '../types';
import { buildExporter } from '../util/exporter';
import { generateReportsDirectoryPath } from '../util/filenames';

function buildVoterTurnoutReport({
  store,
  cardCountsList,
}: {
  store: Store;
  cardCountsList: Tabulation.GroupList<Tabulation.CardCounts>;
}): JSX.Element {
  const electionId = store.getCurrentElectionId();
  assert(electionId !== undefined);
  const electionRecord = store.getElection(electionId);
  assert(electionRecord);
  const { electionDefinition, electionPackageHash, isOfficialResults } =
    electionRecord;
  const isTest = store.getCurrentCvrFileModeForElection(electionId) === 'test';
  const registeredVoterCounts = store.getRegisteredVoterCounts(electionId);
  assert(
    registeredVoterCounts !== undefined,
    'Voter turnout report requires registered voter counts'
  );

  return VoterTurnoutReport({
    electionDefinition,
    electionPackageHash,
    isOfficial: isOfficialResults,
    isTest,
    cardCountsList,
    registeredVoterCounts,
    generatedAtTime: new Date(getCurrentTime()),
  });
}

interface VoterTurnoutReportWarning {
  type: PdfError;
}

/**
 * PDF data for a voter turnout report alongside any potential warnings.
 */
export interface VoterTurnoutReportPreview {
  pdf?: Uint8Array;
  warning?: VoterTurnoutReportWarning;
}

interface VoterTurnoutReportProps {
  store: Store;
  cardCountsList: Tabulation.GroupList<Tabulation.CardCounts>;
  logger: Logger;
}

/**
 * Returns a PDF preview of the voter turnout report, as a buffer.
 */
export async function generateVoterTurnoutReportPreview({
  logger,
  ...reportProps
}: VoterTurnoutReportProps): Promise<VoterTurnoutReportPreview> {
  const result = await (async () => {
    const report = buildVoterTurnoutReport(reportProps);
    const pdfResult = await renderToPdf({ document: report });
    return {
      pdf: pdfResult.ok(),
      warning: pdfResult.isErr() ? { type: pdfResult.err() } : undefined,
    };
  })();
  await logger.logAsCurrentRole(LogEventId.ElectionReportPreviewed, {
    message: `User previewed the voter turnout report.${
      result.warning ? ` Warning: ${result.warning.type}` : ''
    }`,
    disposition: result.pdf ? 'success' : 'failure',
  });
  return result;
}

/**
 * Generates the voter turnout report, sends it to the printer, and logs
 * success or failure.
 */
export async function printVoterTurnoutReport({
  printer,
  logger,
  ...reportProps
}: VoterTurnoutReportProps & { printer: Printer }): Promise<void> {
  const report = buildVoterTurnoutReport(reportProps);

  try {
    const data = (await renderToPdf({ document: report })).unsafeUnwrap();
    await printer.print({ data });
    await logger.logAsCurrentRole(LogEventId.ElectionReportPrinted, {
      message: `User printed the voter turnout report.`,
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.logAsCurrentRole(LogEventId.ElectionReportPrinted, {
      message: `Error in attempting to print the voter turnout report: ${error.message}`,
      disposition: 'failure',
    });
  }
}

/**
 * Generates the voter turnout report and exports it as a PDF file on the USB
 * drive.
 */
export async function exportVoterTurnoutReportPdf({
  filename,
  usbDrive,
  logger,
  ...reportProps
}: VoterTurnoutReportProps & {
  filename: string;
  usbDrive: UsbDrive;
}): Promise<ExportDataResult> {
  const report = buildVoterTurnoutReport(reportProps);
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
    } voter turnout report PDF file to ${reportPath} on the USB drive.`,
    path: reportPath,
  });

  return exportFileResult;
}
