import { AdminReadinessReport } from '@votingworks/ui';
import { Printer, renderToPdf } from '@votingworks/printing';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { assert } from '@votingworks/basics';
import { VX_MACHINE_ID, getBatteryInfo } from '@votingworks/backend';
import { DiagnosticsRecord } from '@votingworks/types';
import { Workspace } from '../util/workspace';
import { getCurrentTime } from '../util/get_current_time';
import { Store } from '../store';

/**
 * Gets the most recent printer diagnostic record from the store.
 */
export function getMostRecentPrinterDiagnostic(
  store: Store
): DiagnosticsRecord | undefined {
  const diagnostics = store.getDiagnosticRecords();
  return diagnostics
    .filter(({ hardware }) => hardware === 'printer')
    .sort((a, b) => b.timestamp - a.timestamp)[0];
}

/**
 * Prints the VxAdmin hardware readiness report.
 */
export async function printReadinessReport({
  workspace,
  printer,
  logger,
  userRole,
}: {
  workspace: Workspace;
  printer: Printer;
  logger: Logger;
  userRole: LoggingUserRole;
}): Promise<void> {
  const { store } = workspace;
  const report = AdminReadinessReport({
    /* c8 ignore start */
    batteryInfo: (await getBatteryInfo()) ?? undefined,
    /* c8 ignore stop */
    diskSpaceSummary: await workspace.getDiskSpaceSummary(),
    printerStatus: await printer.status(),
    mostRecentPrinterDiagnostic: getMostRecentPrinterDiagnostic(store),
    machineId: VX_MACHINE_ID,
    generatedAtTime: new Date(getCurrentTime()),
  });

  try {
    await printer.print({ data: await renderToPdf(report) });
    await logger.log(LogEventId.ReadinessReportPrinted, userRole, {
      message: `User printed the equipment readiness report.`,
      disposition: 'success',
    });
  } catch (error) {
    assert(error instanceof Error);
    await logger.log(LogEventId.ReadinessReportPrinted, userRole, {
      message: `Error in attempting to print the equipment readiness report: ${error.message}`,
      disposition: 'failure',
    });
  }
}
