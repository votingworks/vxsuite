import { UsbDrive } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import { CentralScanReadinessReport } from '@votingworks/ui';
import {
  ExportDataResult,
  Exporter,
  getMachineId,
  getBatteryInfo,
  getScanAllowedExportPatterns,
} from '@votingworks/backend';
import { renderToPdf } from '@votingworks/printing';
import { generateReadinessReportFilename } from '@votingworks/utils';
import { Workspace } from './util/workspace.js';
import { getCurrentTime } from './util/get_current_time.js';

/**
 * Saves the VxCentralScan hardware readiness report to the USB drive.
 */
export async function saveReadinessReport({
  workspace,
  isScannerAttached,
  usbDrive,
  logger,
}: {
  workspace: Workspace;
  isScannerAttached: boolean;
  usbDrive: UsbDrive;
  logger: Logger;
}): Promise<ExportDataResult> {
  const { store } = workspace;
  const generatedAtTime = new Date(getCurrentTime());
  const { electionDefinition, electionPackageHash } =
    // @coverage-defer
    store.getElectionRecord() ?? {};
  const markThresholds = store.getSystemSettings()?.markThresholds;
  const report = CentralScanReadinessReport({
    batteryInfo:
      (await getBatteryInfo({ logger })) ?? /* @coverage-exclude */ undefined,
    diskSpaceSummary: await workspace.getDiskSpaceSummary(),
    isScannerAttached,
    mostRecentScannerDiagnostic:
      store.getMostRecentDiagnosticRecord('blank-sheet-scan'),
    mostRecentUpsDiagnostic: store.getMostRecentDiagnosticRecord(
      'uninterruptible-power-supply'
    ),
    machineId: getMachineId(),
    generatedAtTime,
    electionDefinition,
    electionPackageHash,
    markThresholds,
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

  // @coverage-defer
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
