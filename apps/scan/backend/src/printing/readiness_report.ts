import { UsbDrive } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  ExportDataResult,
  Exporter,
  SCAN_ALLOWED_EXPORT_PATTERNS,
  VX_MACHINE_ID,
} from '@votingworks/backend';
import { renderToPdf } from '@votingworks/printing';
import { generateReadinessReportFilename } from '@votingworks/utils';
import { ScanReadinessReport } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { Workspace } from '../util/workspace';
import { getCurrentTime } from '../util/get_current_time';
import { Printer } from './printer';

/**
 * Saves the VxCentralScan hardware readiness report to the USB drive.
 */
export async function saveReadinessReport({
  workspace,
  usbDrive,
  logger,
  printer,
}: {
  workspace: Workspace;
  usbDrive: UsbDrive;
  logger: Logger;
  printer: Printer;
}): Promise<ExportDataResult> {
  const { store } = workspace;
  const generatedAtTime = new Date(getCurrentTime());
  const electionRecord = store.getElectionRecord();
  const printerStatus = await printer.getStatus();
  assert(printerStatus.scheme === 'hardware-v4');
  const report = ScanReadinessReport({
    electionDefinition: electionRecord?.electionDefinition,
    electionPackageHash: electionRecord?.electionPackageHash,
    expectPrecinctSelection: true,
    precinctSelection: store.getPrecinctSelection(),
    diskSpaceSummary: await workspace.getDiskSpaceSummary(),
    printerStatus,
    mostRecentPrinterDiagnostic:
      store.getMostRecentDiagnosticRecord('test-print'),
    machineId: VX_MACHINE_ID,
    generatedAtTime,
  });

  const data = await renderToPdf({ document: report });
  const exporter = new Exporter({
    usbDrive,
    allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
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
