import { BaseLogger, LogEventId } from '@votingworks/logging';
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
  if (previousStatus.state !== newStatus.state) {
    logger.log(LogEventId.PrinterStatusChanged, 'system', {
      message: `Printer Status updated from ${JSON.stringify(
        previousStatus
      )} to ${JSON.stringify(newStatus)}`,
      status: JSON.stringify(newStatus),
      disposition: newStatus.state === 'error' ? 'failure' : 'success',
    });
  } else if (
    previousStatus.state === 'error' &&
    newStatus.state === 'error' &&
    previousStatus.type !== newStatus.type
  ) {
    logger.log(LogEventId.PrinterStatusChanged, 'system', {
      message: `Printer Status updated from ${JSON.stringify(
        previousStatus
      )} to ${JSON.stringify(newStatus)}`,
      status: JSON.stringify(newStatus),
      disposition: 'failure',
    });
  }
}
