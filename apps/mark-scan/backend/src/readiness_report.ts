import { UsbDrive } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import { MarkScanReadinessReport } from '@votingworks/ui';
import {
  ExportDataResult,
  Exporter,
  SCAN_ALLOWED_EXPORT_PATTERNS,
  VX_MACHINE_ID,
  getBatteryInfo,
} from '@votingworks/backend';
import { renderToPdf } from '@votingworks/printing';
import { generateReadinessReportFilename } from '@votingworks/utils';
import { Workspace } from './util/workspace';
import { getCurrentTime } from './util/get_current_time';
import { isAccessibleControllerDaemonRunning } from './util/controllerd';
import { PaperHandlerStateMachine } from './custom-paper-handler';

/**
 * Saves the VxMarkScan hardware readiness report to the USB drive.
 */
export async function saveReadinessReport({
  workspace,
  usbDrive,
  logger,
  stateMachine,
}: {
  workspace: Workspace;
  usbDrive: UsbDrive;
  logger: Logger;
  stateMachine?: PaperHandlerStateMachine;
}): Promise<ExportDataResult> {
  const { store } = workspace;
  const generatedAtTime = new Date(getCurrentTime());
  const electionDefinition = store.getElectionDefinition();
  const precinctSelection = store.getPrecinctSelection();
  const report = MarkScanReadinessReport({
    batteryInfo:
      /* istanbul ignore next */ (await getBatteryInfo()) ?? undefined,
    diskSpaceSummary: await workspace.getDiskSpaceSummary(),
    accessibleControllerProps: {
      isDeviceConnected: await isAccessibleControllerDaemonRunning(),
      mostRecentDiagnosticRecord: store.getMostRecentDiagnosticRecord(
        'mark-scan-accessible-controller'
      ),
    },
    paperHandlerProps: {
      isDeviceConnected: !!(
        stateMachine && stateMachine.getSimpleStatus() !== 'no_hardware'
      ),
      mostRecentDiagnosticRecord: store.getMostRecentDiagnosticRecord(
        'mark-scan-paper-handler'
      ),
    },
    machineId: VX_MACHINE_ID,
    generatedAtTime,
    electionDefinition,
    expectPrecinctSelection: true,
    precinctSelection,
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
