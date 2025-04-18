import { BaseLogger, LogEventId } from '@votingworks/logging';
import { deepEqual } from '@votingworks/basics';
import { PrinterStatus } from './types';

export function logPrinterStatusIfChanged(
  logger: BaseLogger,
  previousStatus?: PrinterStatus,
  newStatus?: PrinterStatus
): void {
  if (!previousStatus && !newStatus) {
    return;
  }
  if (!previousStatus) {
    logger.log(LogEventId.PrinterStatusChanged, 'system', {
      message: `Printer Status initiated with ${JSON.stringify(newStatus)}`,
      status: JSON.stringify(newStatus),
      disposition:
        newStatus && newStatus.state === 'error' ? 'failure' : 'success',
    });
    return;
  }
  if (!newStatus) {
    logger.log(LogEventId.PrinterStatusChanged, 'system', {
      message: `Printer status disconnected.`,
      disposition: 'failure',
    });
    return;
  }
  if (!deepEqual(previousStatus, newStatus)) {
    logger.log(LogEventId.PrinterStatusChanged, 'system', {
      message: `Printer Status updated from ${JSON.stringify(
        previousStatus
      )} to ${JSON.stringify(newStatus)}`,
      status: JSON.stringify(newStatus),
      disposition: newStatus.state === 'error' ? 'failure' : 'success',
    });
  }
}
