import { UsbDrive } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import { CentralScanReadinessReport } from '@votingworks/ui';
import {
  ExportDataResult,
  Exporter,
  SCAN_ALLOWED_EXPORT_PATTERNS,
  VX_MACHINE_ID,
  getBatteryInfo,
} from '@votingworks/backend';
import { renderToPdf } from '@votingworks/printing';
import { generateFileTimeSuffix } from '@votingworks/utils';
import { Workspace } from './util/workspace';
import { getCurrentTime } from './util/get_current_time';

function getReportFilename(time: Date): string {
  return `readiness-report__${VX_MACHINE_ID}__${generateFileTimeSuffix(
    time
  )}.pdf`;
}

/**
 * Prints the VxAdmin hardware readiness report.
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
  const reportDate = new Date(getCurrentTime());
  const report = CentralScanReadinessReport({
    /* c8 ignore start */
    batteryInfo: (await getBatteryInfo()) ?? undefined,
    /* c8 ignore stop */
    diskSpaceSummary: await workspace.getDiskSpaceSummary(),
    isScannerAttached,
    mostRecentScannerDiagnostic:
      store.getMostRecentDiagnosticRecord('blank-sheet-scan'),
    machineId: VX_MACHINE_ID,
    generatedAtTime: reportDate,
  });

  const data = await renderToPdf({ document: report });
  const exporter = new Exporter({
    usbDrive,
    allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
  });
  const exportFileResult = await exporter.exportDataToUsbDrive(
    '.',
    getReportFilename(reportDate),
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
