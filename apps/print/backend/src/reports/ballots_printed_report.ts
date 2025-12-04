import { assert, assertDefined } from '@votingworks/basics';
import { BallotsPrintedReport } from '@votingworks/ui';
import { LogEventId, Logger } from '@votingworks/logging';
import { Printer, renderToPdf } from '@votingworks/printing';
import { UsbDrive } from '@votingworks/usb-drive';
import { Exporter } from '@votingworks/backend';
import { join } from 'node:path';
import {
  generateElectionBasedSubfolderName,
  REPORT_FOLDER,
  generateFileTimeSuffix,
} from '@votingworks/utils';
import { ElectionDefinition } from '@votingworks/types';
import { Store } from '../store';
import { PRINT_ALLOWED_EXPORT_PATTERNS } from '../globals';

export function generateReportsDirectoryPath(
  electionDefinition: ElectionDefinition
): string {
  return join(
    generateElectionBasedSubfolderName(
      electionDefinition.election,
      electionDefinition.ballotHash
    ),
    REPORT_FOLDER
  );
}

function buildBallotsPrintedReport({ store }: { store: Store }): JSX.Element {
  const electionRecord = assertDefined(store.getElectionRecord());
  const { electionDefinition, electionPackageHash } = electionRecord;

  const isTestMode = store.getTestMode();
  const ballotMode = isTestMode ? 'test' : 'official';

  const printCounts = store.getBallotPrintCounts({ ballotMode });

  return BallotsPrintedReport({
    electionDefinition,
    electionPackageHash,
    printCounts,
    generatedAtTime: new Date(),
    isTestMode,
  });
}

export async function printBallotsPrintedReport({
  printer,
  logger,
  store,
}: {
  printer: Printer;
  logger: Logger;
  store: Store;
}): Promise<void> {
  const report = buildBallotsPrintedReport({ store });
  const renderResult = await renderToPdf({ document: report });
  if (renderResult.isErr()) {
    const error = renderResult.err();
    await logger.logAsCurrentRole(LogEventId.FileSaved, {
      disposition: 'failure',
      message: `Failed to render Ballots Printed Report PDF file: ${error}`,
    });
    return;
  }

  const data = renderResult.ok();
  try {
    await printer.print({ data });
    await logger.logAsCurrentRole(LogEventId.ElectionReportPrinted, {
      message: 'User printed a Ballots Printed Report.',
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.logAsCurrentRole(LogEventId.ElectionReportPrinted, {
      message: `Error in attempting to print Ballots Printed Report: ${error.message}`,
      disposition: 'failure',
    });
  }
}

export async function exportBallotsPrintedReportPdf({
  usbDrive,
  logger,
  store,
}: {
  usbDrive: UsbDrive;
  logger: Logger;
  store: Store;
}): Promise<void> {
  const report = buildBallotsPrintedReport({ store });
  const renderResult = await renderToPdf({ document: report });
  if (renderResult.isErr()) {
    const error = renderResult.err();
    await logger.logAsCurrentRole(LogEventId.FileSaved, {
      disposition: 'failure',
      message: `Failed to render Ballots Printed Report PDF file: ${error}`,
    });
    return;
  }

  const data = renderResult.ok();
  const electionRecord = assertDefined(store.getElectionRecord());
  const { electionDefinition } = electionRecord;
  const reportsDirectoryPath = generateReportsDirectoryPath(electionDefinition);
  const filename = `ballots-printed-report__${generateFileTimeSuffix()}.pdf`;

  const exporter = new Exporter({
    allowedExportPatterns: PRINT_ALLOWED_EXPORT_PATTERNS,
    usbDrive,
  });

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
    } Ballots Printed Report PDF file to ${reportPath} on the USB drive.`,
    path: reportPath,
  });
}
