import { UsbDrive } from '@votingworks/usb-drive';
import { LogEventId, Logger } from '@votingworks/logging';
import { MarkScanReadinessReport } from '@votingworks/ui';
import {
  ExportDataResult,
  Exporter,
  SCAN_ALLOWED_EXPORT_PATTERNS,
  VX_MACHINE_ID,
} from '@votingworks/backend';
import { renderToPdf } from '@votingworks/printing';
import { generateReadinessReportFilename } from '@votingworks/utils';
import { Workspace } from './util/workspace';
import { getCurrentTime } from './util/get_current_time';
import {
  getMarkScanBmdModel,
  isAccessibleControllerDaemonRunning,
} from './util/hardware';
import { PaperHandlerStateMachine } from './custom-paper-handler';

/**
 * Saves the VxMark hardware readiness report to the USB drive.
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
  stateMachine: PaperHandlerStateMachine;
}): Promise<ExportDataResult> {
  const { store } = workspace;
  const generatedAtTime = new Date(getCurrentTime());
  const { electionDefinition, electionPackageHash } =
    store.getElectionRecord() ?? {};
  const precinctSelection = store.getPrecinctSelection();
  const isControllerDaemonRunning = await isAccessibleControllerDaemonRunning(
    workspace.path,
    logger
  );

  // On the BMD 150 a single daemon handles PAT and accessible controller.
  // On the BMD 155 they are separate, but the PAT daemon doesn't report its
  // status in the same way, so we haven't implemented a way to read BMD 155
  // PAT daemon status.
  // As a graceful fallback for the BMD 155, the readiness report reports
  // on PAT device connection (ie. is a sip & puff plugged in?) rather than
  // PAT input availability (ie. is the daemon running and able to query firmware?)
  const isPatAvailable =
    getMarkScanBmdModel() === 'bmd-150'
      ? isControllerDaemonRunning
      : !!stateMachine.isPatDeviceConnected();

  const report = MarkScanReadinessReport({
    diskSpaceSummary: await workspace.getDiskSpaceSummary(),
    accessibleControllerProps: {
      isDeviceConnected: isControllerDaemonRunning,
      mostRecentDiagnosticRecord: store.getMostRecentDiagnosticRecord(
        'mark-scan-accessible-controller'
      ),
    },
    paperHandlerProps: {
      isDeviceConnected: !!(stateMachine.getSimpleStatus() !== 'no_hardware'),
      mostRecentDiagnosticRecord: store.getMostRecentDiagnosticRecord(
        'mark-scan-paper-handler'
      ),
    },
    patInputProps: {
      isDeviceConnected: isPatAvailable,
      mostRecentDiagnosticRecord: store.getMostRecentDiagnosticRecord(
        'mark-scan-pat-input'
      ),
    },
    headphoneInputProps: {
      mostRecentDiagnosticRecord: store.getMostRecentDiagnosticRecord(
        'mark-scan-headphone-input'
      ),
    },
    machineId: VX_MACHINE_ID,
    generatedAtTime,
    electionDefinition,
    electionPackageHash,
    expectPrecinctSelection: true,
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
