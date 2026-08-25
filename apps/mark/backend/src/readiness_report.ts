import { UsbDrive } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import { generateReadinessReportFilename } from '@votingworks/utils';
import { MarkReadinessReport } from '@votingworks/ui';
import {
  ExportDataResult,
  Exporter,
  getScanAllowedExportPatterns,
  getMachineId,
} from '@votingworks/backend';
import { Printer, renderToPdf } from '@votingworks/printing';
import { Workspace } from './util/workspace.js';
import {
  isAccessibleControllerAttached,
  isPatInputAttached,
} from './util/accessible_controller.js';
import * as barcodes from './barcodes/index.js';
import { getCurrentTime } from './util/get_current_time.js';

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
  const pollingPlaceId = store.getPollingPlaceId();
  const printerStatus = await printer.status();

  const report = MarkReadinessReport({
    diskSpaceSummary: await workspace.getDiskSpaceSummary(),
    accessibleControllerProps: {
      isDeviceConnected: isAccessibleControllerAttached(),
      mostRecentDiagnosticRecord: store.getMostRecentDiagnosticRecord(
        'mark-accessible-controller'
      ),
    },
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
    systemAudioProps: {
      mostRecentDiagnosticRecord:
        store.getMostRecentDiagnosticRecord('mark-system-audio'),
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
    machineId: getMachineId(),
    generatedAtTime,
    electionDefinition,
    electionPackageHash,
    pollingPlaceId,
  });
  // Readiness report PDF shouldn't be too long, so we don't expect a render error
  const data = (await renderToPdf({ document: report })).unsafeUnwrap();

  const exporter = new Exporter({
    usbDrive,
    allowedExportPatterns: getScanAllowedExportPatterns(),
  });
  const exportFileResult = await exporter.exportDataToUsbDrive(
    '.',
    generateReadinessReportFilename({
      generatedAtTime,
      machineId: getMachineId(),
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
