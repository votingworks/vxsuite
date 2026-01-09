import { UsbDrive } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import { MarkReadinessReport } from '@votingworks/ui';
import {
  ExportDataResult,
  Exporter,
  SCAN_ALLOWED_EXPORT_PATTERNS,
  VX_MACHINE_ID,
} from '@votingworks/backend';
import { Printer, renderToPdf } from '@votingworks/printing';
import { generateReadinessReportFilename } from '@votingworks/utils';
import { Workspace } from './util/workspace';
import {
  isAccessibleControllerAttached,
  isPatInputAttached,
} from './util/accessible_controller';
import * as barcodes from './barcodes';
import { getCurrentTime } from './util/get_current_time';

/**
 * Saves the VxMark hardware readiness report to the USB drive.
 */
export async function saveReadinessReport({
  workspace,
  usbDrive,
  logger,
  printer,
  barcodeClient,
}: {
  workspace: Workspace;
  usbDrive: UsbDrive;
  logger: Logger;
  printer: Printer;
  barcodeClient: barcodes.BarcodeReader;
}): Promise<ExportDataResult> {
  const { store } = workspace;
  const generatedAtTime = new Date(getCurrentTime());
  const { electionDefinition, electionPackageHash } =
    store.getElectionRecord() ?? {};
  const precinctSelection = store.getPrecinctSelection();
  const printerStatus = await printer.status();

  const report = MarkReadinessReport({
    diskSpaceSummary: await workspace.getDiskSpaceSummary(),
    accessibleControllerConnected: isAccessibleControllerAttached(),
    patInputProps: {
      isDeviceConnected: isPatInputAttached(),
      mostRecentDiagnosticRecord:
        store.getMostRecentDiagnosticRecord('mark-pat-input'),
    },
    headphoneInputProps: {
      mostRecentDiagnosticRecord: store.getMostRecentDiagnosticRecord(
        'mark-headphone-input'
      ),
    },
    barcodeReaderProps: {
      isDeviceConnected: barcodeClient.getConnectionStatus(),
      mostRecentDiagnosticRecord: store.getMostRecentDiagnosticRecord(
        'mark-barcode-reader'
      ),
    },
    printerStatus,
    mostRecentUpsDiagnostic: store.getMostRecentDiagnosticRecord(
      'uninterruptible-power-supply'
    ),
    machineId: VX_MACHINE_ID,
    generatedAtTime,
    electionDefinition,
    electionPackageHash,
    precinctSelection,
  });
  // Readiness report PDF shouldn't be too long, so we don't expect a render error
  const data = (await renderToPdf({ document: report })).unsafeUnwrap();

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
