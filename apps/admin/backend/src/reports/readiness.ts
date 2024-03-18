import { AdminReadinessReport } from '@votingworks/ui';
import { Printer, renderToPdf } from '@votingworks/printing';
import { LogEventId, Logger } from '@votingworks/logging';
import { assert } from '@votingworks/basics';
import { VX_MACHINE_ID, getBatteryInfo } from '@votingworks/backend';
import { Workspace } from '../util/workspace';
import { getCurrentTime } from '../util/get_current_time';

/**
 * Prints the VxAdmin hardware readiness report.
 */
export async function printReadinessReport({
  workspace,
  printer,
  logger,
}: {
  workspace: Workspace;
  printer: Printer;
  logger: Logger;
}): Promise<void> {
  const { store } = workspace;
  const report = AdminReadinessReport({
    /* c8 ignore start */
    batteryInfo: (await getBatteryInfo()) ?? undefined,
    /* c8 ignore stop */
    diskSpaceSummary: await workspace.getDiskSpaceSummary(),
    printerStatus: await printer.status(),
    mostRecentPrinterDiagnostic:
      store.getMostRecentDiagnosticRecord('test-print'),
    machineId: VX_MACHINE_ID,
    generatedAtTime: new Date(getCurrentTime()),
  });

  try {
    await printer.print({ data: await renderToPdf({ document: report }) });
    await logger.logAsCurrentRole(LogEventId.ReadinessReportPrinted, {
      message: `User printed the equipment readiness report.`,
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.logAsCurrentRole(LogEventId.ReadinessReportPrinted, {
      message: `Error in attempting to print the equipment readiness report: ${error.message}`,
      disposition: 'failure',
    });
  }
}
