import { AdminReadinessReport } from '@votingworks/ui';
import { Printer, renderToPdf } from '@votingworks/printing';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  ExportDataResult,
  Exporter,
  VX_MACHINE_ID,
  getBatteryInfo,
} from '@votingworks/backend';
import { generateReadinessReportFilename } from '@votingworks/utils';
import { UsbDrive } from '@votingworks/usb-drive';
import { Workspace } from '../util/workspace';
import { getCurrentTime } from '../util/get_current_time';
import { ADMIN_ALLOWED_EXPORT_PATTERNS } from '../globals';

async function getReadinessReport({
  workspace,
  printer,
  generatedAtTime = new Date(getCurrentTime()),
}: {
  workspace: Workspace;
  printer: Printer;
  generatedAtTime?: Date;
}): Promise<JSX.Element> {
  const { store } = workspace;
  const currentElectionId = store.getCurrentElectionId();
  const electionRecord = currentElectionId
    ? store.getElection(currentElectionId)
    : undefined;
  const electionDefinition = electionRecord
    ? electionRecord.electionDefinition
    : undefined;

  return AdminReadinessReport({
    /* istanbul ignore next */
    batteryInfo: (await getBatteryInfo()) ?? undefined,
    diskSpaceSummary: await workspace.getDiskSpaceSummary(),
    printerStatus: await printer.status(),
    mostRecentPrinterDiagnostic:
      store.getMostRecentDiagnosticRecord('test-print'),
    machineId: VX_MACHINE_ID,
    generatedAtTime,
    electionDefinition,
  });
}

/**
 * Saves the VxAdmin hardware readiness report to the USB drive.
 */
export async function saveReadinessReport({
  workspace,
  printer,
  usbDrive,
  logger,
}: {
  workspace: Workspace;
  printer: Printer;
  usbDrive: UsbDrive;
  logger: Logger;
}): Promise<ExportDataResult> {
  const generatedAtTime = new Date(getCurrentTime());
  const report = await getReadinessReport({ workspace, printer });

  const data = await renderToPdf({ document: report });
  const exporter = new Exporter({
    usbDrive,
    allowedExportPatterns: ADMIN_ALLOWED_EXPORT_PATTERNS,
  });
  const exportFileResult = await exporter.exportDataToUsbDrive(
    '.',
    generateReadinessReportFilename({
      generatedAtTime,
      machineId: VX_MACHINE_ID,
    }),
    data
  );

  if (exportFileResult.isOk()) {
    await logger.logAsCurrentRole(LogEventId.ReadinessReportSaved, {
      message: `User saved the equipment readiness report to a USB drive.`,
      disposition: 'success',
    });
  } else {
    await logger.logAsCurrentRole(LogEventId.ReadinessReportSaved, {
      message: `Error while attempting to save the equipment readiness report to a USB drive: ${
        exportFileResult.err().message
      }`,
      disposition: 'failure',
    });
  }

  return exportFileResult;
}
